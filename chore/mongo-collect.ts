import { resolve, dirname } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { hash } from '@konfirm/checksum';
import { Version } from '../source/domain/version';
import { readJSONFile, writeJSONFile } from '../source/domain/json';
import { driver } from '../source/domain/mongo/driver';
import { DSN } from '../source/domain/mongo/dsn';
import {
    findKnownIssue,
    issuesForCollection,
    issuesForVersion,
} from '../source/domain/mongo/known-issues';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { id, serialize } from '../source/domain/serialization';

type CatalogWorkItem = {
    name: string;
    path: string;
    hash: string;
};

type VersionWorkPlan = {
    version: string;
    catalogs: CatalogWorkItem[];
    created: string;
    updated: string;
};

type CollectionCompletedRecord = {
    type: 'collection-completed';
    date: string;
    catalog: string;
    hash: string;
    resultChecksum: string;
    bootstrap?: {
        problems: Array<{
            error: { message: string; code?: string | number; type?: string };
            documents: number[];
        }>;
    };
};

type CollectionHaltedRecord = {
    type: 'collection-halted';
    date: string;
    catalog: string;
    reason: string;
    // Populated only when a real mongod crash was confirmed via its own
    // container logs at halt time — a generic timeout/budget-exceeded halt
    // says nothing about whether the query itself was dangerous, so this
    // stays absent for those. `operation` (not just `operationId`) is kept
    // so a human writing a KnownIssue rule later has the actual query to
    // look at, not just an opaque hash.
    crash?: {
        operation: any;
        operationId: string;
        indices?: any[];
        log: string;
    };
};

type MetaData = {
    history: Array<CollectionCompletedRecord | CollectionHaltedRecord>;
};

type Catalog = {
    name: string;
    operations: any[];
    collection?: {
        records?: any[];
        indices?: any[];
    };
};

// Bounds total wall-clock time for one version's entire collection run. A
// per-query cap alone doesn't prevent a run from overrunning (many catalogs
// each individually under the cap can still sum to far more than this) —
// raceAgainstBudget, checked before every driver call below, is what
// actually enforces this bound.
const RUN_BUDGET_MS = 2 * 60_000;

// Takes a thunk rather than an already-started promise specifically so it
// can refuse to even invoke it once the deadline has passed, rather than
// kicking off a real (doomed) MongoDB call only to abandon it immediately.
// `crashSignal`, when given, is a third race competitor — see
// createCrashWatcher below for why this beats waiting out a timeout.
function raceAgainstBudget<T>(
    call: () => Promise<T>,
    deadline: number,
    crashSignal?: Promise<never>
): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        return Promise.reject(new Error('run-time-budget-exceeded'));
    }
    const competitors: Array<Promise<T>> = [
        call(),
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('run-time-budget-exceeded')), remaining)
        ),
    ];
    if (crashSignal) {
        competitors.push(crashSignal);
    }
    return Promise.race(competitors);
}

const { MONGO_VERSION = '8' } = process.env;
const automation = resolve(__dirname, '..', 'automation');
const version = new Version(MONGO_VERSION);
const dsn = new DSN('/MongoCatalog/CatalogCollection');

// Matches catalog.yml's `docker run -d --name mongodb-$VERSION ...` exactly
// (same MONGO_VERSION/matrix.version value) — nothing enforces this pairing
// at the type level, so if that naming ever changes in the workflow, this
// needs to change with it.
const CONTAINER_NAME = `mongodb-${MONGO_VERSION}`;

// MongoDB's own (pre-JSON-logging) log format is
// "<timestamp> <severity> <component>  [context] message", severity being
// a single letter (D/I/W/E/F) — F is fatal, exactly the signature every
// crash reproduced this session actually showed
// ("F - [conn3] Invariant failure ...", "F - [conn3] Got signal: 6").
// A local, already-exited container's logs are just captured output, not a
// live call — no timeout-guarding needed the way live driver calls are.
function findCrashLog(containerName: string): string | undefined {
    try {
        const logs = execSync(`docker logs ${containerName} 2>&1`, {
            encoding: 'utf-8',
        });
        const lines = logs
            .split('\n')
            .filter((line) => /^\S+\s+F\s/.test(line));

        return lines.length > 0 ? lines.join('\n') : undefined;
    } catch {
        return undefined;
    }
}

// Streams `docker logs -f` instead of waiting for the driver to notice on
// its own — a crashed mongod doesn't necessarily close the socket cleanly
// (SIGABRT kills the process mid-request, no guaranteed FIN/RST), so the
// client can otherwise sit on a dead connection until its own
// connectTimeoutMS/serverSelectionTimeoutMS gives up (~10s) or the whole
// run budget does (2min) — this catches it the moment mongod actually
// writes the fatal line instead. The returned `signal` promise is a single
// shared object reused across every raceAgainstBudget call for the rest of
// this run: once mongod genuinely crashes there's no scenario where it
// comes back (no restart policy on the container), so once tripped it
// should — and, because a settled promise stays settled, automatically
// does — stay tripped for every catalog still to come, not just the one in
// flight when it fired.
function createCrashWatcher(containerName: string): {
    signal: Promise<never>;
    stop: () => void;
} {
    let reject!: (reason: Error) => void;
    const signal = new Promise<never>((_, rej) => {
        reject = rej;
    });
    // Attach a permanent no-op handler immediately — this promise may sit
    // unrejected (and therefore, in Node's eyes, unhandled) for a while
    // before it's ever raced against anything, and we don't want a false
    // "unhandled rejection" warning the moment it does fire.
    signal.catch(() => {});

    let buffer = '';
    const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const fatal = lines.find((line) => /^\S+\s+F\s/.test(line));
        if (fatal) {
            reject(new Error(`server-crash-detected: ${fatal.trim()}`));
        }
    };

    const proc = spawn('docker', ['logs', '-f', containerName]);
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    // A watcher that fails to start shouldn't take the rest of the script
    // down with it — findCrashLog in the catch blocks below still provides
    // the same evidence, just after the fact instead of live.
    proc.on('error', () => {});

    return { signal, stop: () => proc.kill() };
}

// Belt-and-suspenders alongside known-issues.ts: a confirmed crash on this
// exact (version, operation) pair — meta.json is already per-version, so no
// separate version check is needed — is auto-excluded from here on, without
// waiting for a human to turn it into a proper KnownIssue rule.
function hasCrashedBefore(meta: MetaData, operationId: string): boolean {
    return meta.history.some(
        (record) =>
            record.type === 'collection-halted' &&
            record.crash?.operationId === operationId
    );
}

async function loadPlan(version: Version): Promise<VersionWorkPlan | null> {
    const planFile = resolve(
        automation,
        'collect',
        `v${version.major}`,
        String(version),
        'plan.json'
    );
    try {
        return await readJSONFile<VersionWorkPlan>(planFile);
    } catch {
        return null;
    }
}

async function savePlan(
    versionDir: string,
    plan: VersionWorkPlan
): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json');
    await writeJSONFile(planFile, plan);
}

async function loadMeta(versionDir: string): Promise<MetaData | null> {
    const metaFile = resolve(versionDir, 'meta.json');
    try {
        return await readJSONFile<MetaData>(metaFile);
    } catch {
        return null;
    }
}

async function saveMeta(versionDir: string, meta: MetaData): Promise<void> {
    const metaFile = resolve(versionDir, 'meta.json');
    await writeJSONFile(metaFile, meta);
}

async function loadCatalog(item: CatalogWorkItem): Promise<Catalog> {
    const component = resolve(process.cwd(), item.path);
    const module = await import(component);
    const catalog = module[item.name];

    if (!catalog) {
        throw new Error(`Export '${item.name}' not found in module`);
    }

    return catalog;
}

Promise.resolve()
    .then(() => loadPlan(version))
    .then(async (plan) => {
        if (!plan) {
            console.log(`No plan found for version ${version}`);
            return;
        }

        if (plan.catalogs.length === 0) {
            console.log(`No pending catalogs for version ${version}`);
            return;
        }

        console.log(`Processing ${plan.catalogs.length} pending catalogs...`);

        const stagingDir = '/tmp/mongo-catalog-changes';
        const versionDir = resolve(
            automation,
            'collect',
            `v${version.major}`,
            String(version)
        );

        const meta = (await loadMeta(versionDir)) || { history: [] };
        const db = await driver(dsn, version);
        const deadline = Date.now() + RUN_BUDGET_MS;
        let completedThisRun = 0;

        const crashWatcher = createCrashWatcher(CONTAINER_NAME);
        // process.exit() doesn't clean up spawned child processes on its
        // own — without this, a leaked `docker logs -f` process is exactly
        // the kind of dangling handle the explicit exit calls below exist
        // to avoid in the first place.
        process.on('exit', crashWatcher.stop);

        // Stage 1 of known-issue checking: version is fixed for this whole
        // run, so narrow the registry down once here rather than on every
        // single query below.
        const versionIssues = issuesForVersion(version);

        for (const item of plan.catalogs) {
            // Budget's already gone — don't spend time even loading the
            // next catalog, let alone starting a doomed driver call for it.
            if (Date.now() >= deadline) break;

            let catalog: Catalog;
            // Declared out here (not inside the second try block below) for
            // the same reason `catalog` is — a try block's own `let`s are
            // not visible from its `catch`, so this needs to live in the
            // shared enclosing scope to be readable when something throws.
            let currentOperation: any;

            try {
                catalog = await loadCatalog(item);
            } catch (error: any) {
                console.error(`✗ ${item.name}: Catalog loading failed`);
                console.error(`  Error: ${error.message || String(error)}`);

                // Add collection-halted record to history
                meta.history.push({
                    type: 'collection-halted',
                    date: new Date().toISOString(),
                    catalog: item.name,
                    reason: `catalog-loading-failed: ${error.message || String(error)}`,
                });
                break;
            }

            try {
                const { operations } = catalog;
                const documents = catalog.collection?.records || [];
                const indices = catalog.collection?.indices;

                // Stage 2: indices are fixed for this catalog, narrow the
                // already-version-filtered list down once more before the
                // per-operation loop below.
                const catalogIssues = issuesForCollection(versionIssues, {
                    indices,
                });

                // Initialize collection with documents and indices
                const bootstrap = await raceAgainstBudget(
                    () =>
                        db.initCollection({
                            name: dsn.collection,
                            indices,
                            documents,
                        }),
                    deadline,
                    crashWatcher.signal
                );

                const result: Array<any> = [];

                for (const operation of operations) {
                    currentOperation = operation;
                    const operationId = id(operation);
                    const knownIssue = findKnownIssue(catalogIssues, operation);

                    if (knownIssue) {
                        result.push({
                            id: operationId,
                            operation,
                            documents: undefined,
                            error: {
                                message: knownIssue.reference,
                                type: 'MongoCatalogKnownIssue',
                            },
                        });
                        continue;
                    }

                    if (hasCrashedBefore(meta, operationId)) {
                        result.push({
                            id: operationId,
                            operation,
                            documents: undefined,
                            error: {
                                message: 'previously-crashed-server',
                                type: 'MongoCatalogKnownIssue',
                            },
                        });
                        continue;
                    }

                    const queryResult = await raceAgainstBudget(
                        () => db.execute(operation),
                        deadline,
                        crashWatcher.signal
                    );

                    const record: any = {
                        id: operationId,
                        operation,
                        documents: queryResult.success
                            ? queryResult.documents
                            : undefined,
                        error: queryResult.success
                            ? undefined
                            : queryResult.error,
                    };

                    result.push(record);
                }

                // Drop collection after processing
                await raceAgainstBudget(
                    () => db.dropCollection(dsn.collection),
                    deadline,
                    crashWatcher.signal
                );

                // Save results
                await writeFile(
                    resolve(versionDir, `${item.name}.json`),
                    serialize(result, '\t')
                );

                // Calculate checksum for this catalog's results
                const resultChecksum = hash(result);

                // Add collection-completed record to history
                meta.history.push({
                    type: 'collection-completed',
                    date: new Date().toISOString(),
                    catalog: item.name,
                    hash: item.hash,
                    resultChecksum,
                    ...(bootstrap.problems.length > 0 && { bootstrap }),
                });
                completedThisRun++;

                console.log(
                    `✓ ${item.name}: ${documents.length} docs, ${operations.length} queries`
                );
            } catch (error: any) {
                const log = findCrashLog(CONTAINER_NAME);

                // Add collection-halted record to history
                meta.history.push({
                    type: 'collection-halted',
                    date: new Date().toISOString(),
                    catalog: item.name,
                    reason: error.message || String(error),
                    ...(log && {
                        crash: {
                            operation: currentOperation,
                            operationId: id(currentOperation),
                            indices: catalog.collection?.indices,
                            log,
                        },
                    }),
                });
                console.error(
                    `✗ ${item.name}: ${error.message || String(error)}`
                );
                break;
            }
        }

        await db.disconnect();

        // Clear plan catalogs (all processed) and update timestamp
        plan.catalogs = [];
        plan.updated = new Date().toISOString();

        // Count results for logging
        const processedCount = meta.history.filter(
            (h) => h.type === 'collection-completed'
        ).length;
        const failedCount = meta.history.filter(
            (h) => h.type === 'collection-halted'
        ).length;

        console.log(`Saving plan with ${plan.catalogs.length} catalogs`);
        console.log(
            `Saving meta with ${processedCount} processed, ${failedCount} failed`
        );

        await savePlan(versionDir, plan);
        await saveMeta(versionDir, meta);
        await mkdir(stagingDir, { recursive: true });
        await cp(versionDir, resolve(stagingDir, String(version)), {
            recursive: true,
        });

        if (completedThisRun === 0) {
            console.error(
                'Completed with errors - check meta.json for failed catalogs'
            );
            process.exit(1);
        }

        // A raced-away call (run-time-budget-exceeded) keeps running in the
        // background even though we've stopped waiting on it — an explicit
        // exit here guarantees we don't hang waiting for that zombie call to
        // settle on its own once everything that did succeed is saved.
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
