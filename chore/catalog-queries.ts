import { join, resolve, relative, basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'glob';
import { createHash } from 'node:crypto';

type QueryFileRecord = {
    name: string;
    path: string;
    hash: string;
    update: Array<{
        type: string;
        date: number;
        before?: string;
    }>;
};

function readJSONFile(path: string): Promise<JSON> {
    return readFile(path)
        .then((buffer: Buffer) => buffer.toString('utf-8'))
        .then((utf8: string) => JSON.parse(utf8));
}

const automation = resolve(__dirname, '..', 'automation');
const catalog = resolve(__dirname, '..', 'catalog');
const catalogQueryFile = resolve(automation, 'catalog-queries.json');

readJSONFile(catalogQueryFile)
    .catch(() => undefined)
    .then((result: unknown = []) => (Array.isArray(result) ? result : []) as Array<QueryFileRecord>)
    .then(async (records) => {
        const files = await glob(join(catalog, '**', '*.ts'));

        for (const file of files) {
            const name = basename(file, '.ts');
            const path = relative(process.cwd(), file);
            const found = records.find((item) => item.path === path);
            const record = found || { name, path, hash: '', update: [] };
            const buffer = await readFile(file);
            const checksum = createHash('sha256').update(buffer).digest('hex');

            if (!found) {
                records.push(record);
            }

            if (record.hash !== checksum) {
                if (record.update.length) {
                    record.update.push({
                        type: 'update',
                        before: record.hash,
                        date: Date.now(),
                    });
                }
                else {
                    record.update.push({
                        type: 'initial',
                        date: Date.now(),
                    });
                }
                record.hash = checksum;
            }
        }

        return records;
    })
    .then((files) => writeFile(catalogQueryFile, JSON.stringify(files, null, '\t')))
    ;