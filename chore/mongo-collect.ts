import { resolve } from 'node:path';
import { Version } from '../source/domain/version';
import { readJSONFile } from '../source/domain/json';

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
        const catalog = await readJSONFile(catalogFile);

        console.log({ meta, catalog });
    });
