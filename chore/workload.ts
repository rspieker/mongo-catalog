import { dirname, resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

type JSONValue = string | number | boolean | null | Array<JSONValue> | { [key: string]: JSONValue };

function readJSONFile<T extends JSONValue>(path: string): Promise<T> {
    return readFile(path)
        .then((buffer: Buffer) => buffer.toString('utf-8'))
        .then((utf8: string) => JSON.parse(utf8));
}

function writeJSONFile<T extends JSONValue>(path: string, data: JSONValue): Promise<JSONValue> {
    return directory(dirname(path))
        .then(() => writeFile(path, JSON.stringify(data, null, '\t')))
        .then(() => data);
}

function directory(path: string): Promise<string> {
    return mkdir(path, { recursive: true }).then(() => path);
}

const automation = resolve(__dirname, '..', 'automation');
const workload = resolve(automation, 'workload.json');
const catalogFile = resolve(automation, 'catalog-queries.json');
const versionsFile = resolve(automation, 'mongo-versions.json');
const collect = resolve(automation, 'collect');

readJSONFile<Array<any>>(workload)
    .catch(() => [])
    .then(async (prior: Array<any>) => {
        const catalog = await readJSONFile<Array<any>>(catalogFile);
        const versions = await readJSONFile<Array<any>>(versionsFile);
        const normalizedCatalog = catalog.map(({ path, hash }) => ({ path, hash }));
        const names = [];

        for (const { version, name, modified } of versions) {
            const [major] = version.split('.');
            const metaFile = resolve(collect, major, version, 'meta.json');
            const meta = await readJSONFile<any>(metaFile)
                .then((meta) => {
                    meta.updated = modified;
                    return meta;
                })
                .catch(() => ({ version, name, catalog: normalizedCatalog, updated: null }));

            if (meta.updated >= modified) {
                meta.catalog = normalizedCatalog.filter(({ path, hash }) => !meta.catalog.find((cat: any) => cat.path === path && cat.hash === hash))
            }

            if (meta.catalog.length) {
                names.push(name);
            }

            await writeJSONFile(metaFile, meta);
        }

        console.log(names.join(','));
        return names;
    })
