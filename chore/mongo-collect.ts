import { resolve, dirname } from 'node:path';
import { hash } from '@konfirm/checksum';
import { Version } from '../source/domain/version';
import { readJSONFile, writeJSONFile } from '../source/domain/json';
import { driver } from '../source/domain/mongo/driver';
import { DSN } from '../source/domain/mongo/dsn';
import { findKnownIssue } from '../source/domain/mongo/known-issues';
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
function raceAgainstBudget<T>(call: () => Promise<T>, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        return Promise.reject(new Error('run-time-budget-exceeded'));
    }
    return Promise.race([
        call(),
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('run-time-budget-exceeded')), remaining)
        ),
    ]);
}

const { MONGO_VERSION = '8' } = process.env;
const automation = resolve(__dirname, '..', 'automation');
const version = new Version(MONGO_VERSION);
const dsn = new DSN('/MongoCatalog/CatalogCollection');

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

        for (const item of plan.catalogs) {
            // Budget's already gone — don't spend time even loading the
            // next catalog, let alone starting a doomed driver call for it.
            if (Date.now() >= deadline) break;

            let catalog: Catalog;

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

                // Initialize collection with documents and indices
                const bootstrap = await raceAgainstBudget(
                    () =>
                        db.initCollection({
                            name: dsn.collection,
                            indices,
                            documents,
                        }),
                    deadline
                );

                const result: Array<any> = [];

                for (const operation of operations) {
                    const knownIssue = findKnownIssue(version, operation);

                    if (knownIssue) {
                        result.push({
                            id: id(operation),
                            operation,
                            documents: undefined,
                            error: {
                                message: knownIssue.reference,
                                type: 'MongoCatalogKnownIssue',
                            },
                        });
                        continue;
                    }

                    const queryResult = await raceAgainstBudget(
                        () => db.execute(operation),
                        deadline
                    );

                    const record: any = {
                        id: id(operation),
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
                    deadline
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
                // Add collection-halted record to history
                meta.history.push({
                    type: 'collection-halted',
                    date: new Date().toISOString(),
                    catalog: item.name,
                    reason: error.message || String(error),
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
