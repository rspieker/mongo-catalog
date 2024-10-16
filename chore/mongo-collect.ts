import { resolve } from 'node:path';
import { Version } from '../source/domain/version';
import { readJSONFile, writeJSONFile } from '../source/domain/json';

const { MONGO_VERSION = '8' } = process.env;
const version = new Version(MONGO_VERSION);
const automation = resolve(__dirname, '..', 'automation');
const catalogFile = resolve(automation, 'catalog-queries.json');
const metaFile = resolve(automation, 'collect', `v${version.major}`, String(version), 'meta.json');

Promise.resolve()
    .then(() => {
        console.log({ version, string: String(version), number: Number(version) });
    })
    .then(() => readJSONFile(metaFile))
    .then(async (meta: any) => {
        const catalog = await readJSONFile<Array<any>>(catalogFile);
        const outdated = catalog.filter(({ path, hash }) => !meta.catalog.find((m: any) => m.path === path && m.hash === hash));

        // dummy data, testing gradual version updates
        outdated.forEach(({ name, path, hash }) => {
            const found = meta.catalog.find((m: any) => m.name === name);
            const record = found || { name, path, hash };

            if (!found) {
                meta.catalog.push(record);
            }
            else {
                found.path = path;
                found.hash = hash;
            }
        });

        await writeJSONFile(metaFile, meta);
    });
