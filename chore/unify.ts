import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { glob } from 'glob';
import { hash } from '@konfirm/checksum';
import { Version } from '../source/domain/version';

const automation = resolve(__dirname, '..', 'automation');

type Collect = {
    catalog: string;
    hash: string;
    query: unknown;
    results: Array<{
        hash: string;
        documents?: unknown;
        error?: unknown;
        versions: Array<Version>;
    }>;
};
type Result = {
    catalog: string;
    operations: Array<{
        operation: Collect['query'];
        results: Array<{
            documents?: unknown;
            error?: unknown;
            versions: string;
        }>;
    }>;
};

async function main(): Promise<void> {
    const collected: Array<Collect> = [];
    const versionSet = new Set<string>();
    const files = await glob(resolve(automation, 'collect', '**', 'meta.json'));

    for (const metaFile of files) {
        const path = dirname(metaFile);
        const meta = await readFile(metaFile).then((buffer) =>
            JSON.parse(buffer.toString('utf8'))
        );
        const version = Version.from(meta.version);
        const catalogs = [
            ...new Set(
                meta.history
                    .filter(({ type }: any) => type === 'collection-completed')
                    .map(({ catalog }: any) => catalog)
            ),
        ];
        // Only include fully qualified versions (have major, minor, and patch)
        if (
            version.major !== undefined &&
            version.minor !== undefined &&
            version.patch !== undefined
        ) {
            versionSet.add(meta.version);
        } else {
            continue;
        }

        for (const catalogName of catalogs) {
            try {
                const catalog = await readFile(
                    resolve(path, `${catalogName}.json`)
                ).then((buffer) => JSON.parse(buffer.toString('utf8')));
                for (const { operation: query, documents, error } of catalog) {
                    const result = hash(documents || error);
                    const checksum = hash(query);
                    const foundQuery = collected.find(
                        ({ hash }) => hash === checksum
                    );
                    const recordQuery: Collect = foundQuery || {
                        catalog: String(catalogName),
                        hash: checksum,
                        query,
                        results: [] as Collect['results'],
                    };
                    if (!foundQuery) collected.push(recordQuery);
                    const foundResult = recordQuery.results.find(
                        ({ hash }) => hash === result
                    );
                    const recordResult = foundResult || {
                        hash: result,
                        documents,
                        error,
                        versions: [] as Array<Version>,
                    };
                    if (!foundResult) recordQuery.results.push(recordResult);
                    recordResult.versions.push(version);
                }
            } catch (e) {
                console.error(e);
                continue;
            }
        }
    }

    const versions = Array.from(versionSet).sort((a, b) =>
        a < b ? -1 : Number(a > b)
    );
    console.log(JSON.stringify(versions));

    const result: Array<Result> = [];
    for (const { catalog: group, query, results } of collected) {
        const foundCatalog = result.find(({ catalog }) => catalog === group);
        const catalog = foundCatalog || { catalog: group, operations: [] };
        const foundOperation = catalog.operations.find(
            ({ operation }) => operation === query
        );
        const operation = foundOperation || { operation: query, results: [] };

        if (!foundCatalog) result.push(catalog);
        if (!foundOperation) catalog.operations.push(operation);

        const collectedVersions = [
            ...new Set(results.flatMap(({ versions }) => versions)),
        ].sort((a, b) => (a < b ? -1 : Number(a > b)));

        console.log(
            `${group}/${JSON.stringify(query)} unique count:`,
            new Set(collectedVersions).size,
            'total:',
            collectedVersions.length
        );

        for (const result of results) {
            const { hash: _, versions: vers, ...rest } = result;
            const indices = vers.map((v) => collectedVersions.indexOf(v));
            const normalized = indices
                .sort((a, b) => (a < b ? -1 : Number(a > b)))
                .reduce(
                    (carry, index) => {
                        const current = carry[carry.length - 1];
                        const last = current?.[current.length - 1];

                        if (!current || last !== index - 1) {
                            carry.push([index]);
                        } else {
                            current.push(index);
                        }

                        return carry;
                    },
                    [] as Array<Array<number>>
                )
                .map((ranges) => {
                    const mapped = ranges.map((index) =>
                        String(collectedVersions[index])
                    );
                    return mapped.length <= 2
                        ? mapped.join(',')
                        : mapped[0] + '..' + mapped[mapped.length - 1];
                })
                .join(',');

            operation.results.push({
                ...rest,
                versions: normalized,
            });
        }
    }

    const outputPath = resolve(automation, 'unified.json');
    await writeFile(outputPath, JSON.stringify(result, null, '\t'));
    console.log(`Written to ${outputPath}`);
}

main().catch((error) => {
    console.error(error);
});
