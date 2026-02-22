import { resolve, dirname } from 'node:path';
import { hash } from '@konfirm/checksum';
import { Version } from '../source/domain/version';
import { readJSONFile, writeJSONFile } from '../source/domain/json';
import { driver } from '../source/domain/mongo/driver';
import { DSN } from '../source/domain/mongo/dsn';
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
        let hasErrors = false;

        for (const item of plan.catalogs) {
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
                hasErrors = true;
                continue;
            }

            try {
                const { operations } = catalog;
                const documents = catalog.collection?.records || [];
                const indices = catalog.collection?.indices;

                // Initialize collection with documents and indices
                await db.initCollection({
                    name: dsn.collection,
                    indices,
                    documents,
                });

                const result: Array<any> = [];

                for (const operation of operations) {
                    const queryResult = await db.execute(operation);

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
                await db.dropCollection(dsn.collection);

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
                });

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
                hasErrors = true;
                console.error(
                    `✗ ${item.name}: ${error.message || String(error)}`
                );
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

        if (hasErrors) {
            console.error(
                'Completed with errors - check meta.json for failed catalogs'
            );
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
