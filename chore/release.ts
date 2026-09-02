// Packages automation/unified.json into per-catalog release files for
// consumers like monger. Each operation carries the FULL version-range
// results (not resolved to "latest") plus which operators it exercises;
// deciding which to trust and test against is downstream's job — this
// only publishes what was objectively observed.

import { execSync } from 'node:child_process';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Catalog, MongoDocument } from '../catalog/catalog';
import { ensure } from '../source/domain/filesystem';
import { readJSONFile, writeJSONFile } from '../source/domain/json';
import { classifyOperators, type OperatorTag } from '../source/domain/mongo/operator-classification';
import { serialize } from '../source/domain/serialization';
import { Version } from '../source/domain/version';

// Record values (read live via loadCollectionRecords, below) and query
// results can carry NaN/Infinity/-Infinity/Date/RegExp which don't translate
// to JSON as we need them to (NaN/Infinity turn into null, Date becomes it's
// ISO string and RegExp becomes an empty object)
async function writeSerializedFile(path: string, data: unknown): Promise<void> {
    await ensure(resolve(path, '..'));
    await writeFile(path, serialize(data, '\t'));
}

const automation = resolve(__dirname, '..', 'automation');
const releaseDir = resolve(automation, 'release');

type UnifiedResult = {
    documents?: Array<number>;
    error?: unknown;
    versions: string;
};
type UnifiedOperation = {
    id: string;
    operation: Record<string, unknown>;
    results: Array<UnifiedResult>;
};
type UnifiedCatalog = {
    catalog: string;
    operations: Array<UnifiedOperation>;
};

type CatalogQueryRecord = {
    name: string;
    path: string;
    exports: Array<{ name: string; type: string; hash: string }>;
};

type ReleaseOperation = {
    id: string;
    query: Record<string, unknown>;
    operators: Array<OperatorTag>;
    results: Array<UnifiedResult>;
};
type ReleaseCatalog = {
    catalog: string;
    collection: { records: Array<unknown> };
    operations: Array<ReleaseOperation>;
};

// record.name is just the file basename and collides across directories
// (common/geo.ts vs coverage/geo.ts) — the export name is the only unique
// identifier shared with unified.json's `catalog` field.
function resolveCatalogPath(catalogExportName: string, records: Array<CatalogQueryRecord>): string {
    const record = records.find((r) => r.exports.some((e) => e.name === catalogExportName));
    if (!record) {
        throw new Error(`No catalog source found for export "${catalogExportName}"`);
    }
    return record.path;
}

async function loadCollectionRecords(path: string, exportName: string): Promise<Array<unknown>> {
    const component = resolve(process.cwd(), path);
    const module = await import(component);
    const catalog = module[exportName] as Catalog<MongoDocument<Record<string, unknown>>> | undefined;

    if (!catalog) {
        throw new Error(`Export '${exportName}' not found in module ${path}`);
    }

    return catalog.collection.records;
}


// Informational only: extracts every version token from a range string
// ("3.3.15..8.3.8", "3.3.15,3.4.2", or bare "8.3.8") and returns the
// numerically highest. Token-to-segment mapping is ambiguous with multiple
// segments, but irrelevant for "highest version anywhere".
function highestVersionIn(range: string): Version {
    const tokens = range.split(',').flatMap((part) => part.split('..'));
    return tokens
        .map((token) => Version.from(token))
        .reduce((highest, current) => (Number(current) > Number(highest) ? current : highest));
}

function fileNameFor(catalogExportName: string): string {
    return `${catalogExportName}.json`;
}

async function main(): Promise<void> {
    const unified = await readJSONFile<Array<UnifiedCatalog>>(resolve(automation, 'unified.json'));
    const catalogQueries = await readJSONFile<Array<CatalogQueryRecord>>(resolve(automation, 'catalog-queries.json'));

    const skipped: Array<{ catalog: string; reason: string }> = [];
    const written: Array<{ catalog: string; file: string; operations: number; taggedOperations: number }> = [];
    let latestVersion: Version | undefined;

    await rm(releaseDir, { recursive: true, force: true });

    for (const catalogEntry of unified) {
        let path: string;
        let records: Array<unknown>;
        try {
            path = resolveCatalogPath(catalogEntry.catalog, catalogQueries);
            records = await loadCollectionRecords(path, catalogEntry.catalog);
        } catch (error: any) {
          skipped.push({ catalog: catalogEntry.catalog, reason: error.message || String(error) });
          continue;
        }

        let taggedOperations = 0;
        const releaseCatalog: ReleaseCatalog = {
            catalog: catalogEntry.catalog,
            collection: { records },
            operations: catalogEntry.operations.map((op) => {
                const operators = classifyOperators(op.operation);
                if (operators.length) {
                    taggedOperations++;
                }
                for (const { versions } of op.results) {
                    const version = highestVersionIn(versions);
                    if (!latestVersion || Number(version) > Number(latestVersion)) {
                        latestVersion = version;
                    }
                }
                return {
                    id: op.id,
                    query: op.operation,
                    operators,
                    results: op.results,
                };
            }),
        };

        const file = fileNameFor(catalogEntry.catalog);
        await writeSerializedFile(resolve(releaseDir, file), releaseCatalog);
        written.push({
            catalog: catalogEntry.catalog,
            file,
            operations: releaseCatalog.operations.length,
            taggedOperations,
        });
    }

    const manifest = {
        generated: new Date().toISOString(),
        latestCollectedVersion: latestVersion ? String(latestVersion) : undefined,
        catalogs: written,
        totals: {
            catalogs: unified.length,
            skippedCatalogs: skipped.length,
            operations: written.reduce((sum, c) => sum + c.operations, 0),
            taggedOperations: written.reduce((sum, c) => sum + c.taggedOperations, 0),
        },
        skipped,
    };
    await writeJSONFile(resolve(releaseDir, 'manifest.json'), manifest as any);

    const archivePath = resolve(releaseDir, 'catalog-release.tar.gz');
    const files = (await readdir(releaseDir)).filter((f) => f.endsWith('.json'));
    execSync(`tar -czf ${archivePath} -C ${releaseDir} ${files.join(' ')}`);

    console.log(
        `Wrote ${written.length} catalog files (${manifest.totals.operations} operations, ${manifest.totals.taggedOperations} with at least one operator tag) to ${releaseDir}`
    );
    if (skipped.length) {
        console.warn(`Skipped ${skipped.length} catalog(s) with no resolvable source:`);
        skipped.forEach(({ catalog, reason }) => console.warn(`  - ${catalog}: ${reason}`));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
