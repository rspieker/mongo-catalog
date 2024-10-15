import { resolve } from "node:path";
import { glob } from "glob";
import { readJSONFile } from "../source/domain/json";

const automation = resolve(__dirname, '..', 'automation');
const catalogFile = resolve(automation, 'catalog-queries.json');

readJSONFile<Array<any>>(catalogFile)
    .then(async (catalog) => {
        const outdated: Set<string> = new Set();
        const files = await glob(resolve(automation, 'collect', '**', 'meta.json'));

        for (const file of files) {
            const meta = await readJSONFile<{ catalog: Array<any>, name: string, updated: string, releases: Array<{ released: string }> }>(file);
            const [release] = meta.releases;

            if (release.released > meta.updated) {
                outdated.add(meta.name);
            }
            else if (!catalog.every((c) => meta.catalog.find((m) => m.hash = c.hash && m.path === c.path))) {
                outdated.add(meta.name);
            }
        }

        return [...outdated];
    })
    .then((outdated: Array<string>) => {
        console.log(JSON.stringify(outdated));
    });
