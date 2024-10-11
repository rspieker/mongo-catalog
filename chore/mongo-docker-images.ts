import { resolve } from "path";
import { getTags } from "../source/domain/docker";
import { Version } from "../source/domain/version";
import { readJSONFile, writeJSONFile } from "../source/domain/json";

type DockerVersion = {
    v2: boolean;
    name: string;
    digest: string;
    images: Array<{
        architecture: string;
        digest: string;
        os: string;
        status: string;
    }>;
    last_updated: string;
};

type MongoVersion = {
    version: string;
    name: string;
    digest: string;
    released: Date;
    catalog: Array<{
        file: string;
        checksum: string;
        date: Date;
    }>;
    updates: Array<{
        type: 'initial' | 'catalog';
        timestamp: number;
    } | {
        type: 'updated'
        before: { [key: string]: unknown };
        timestamp: number;
    }>;
    modified: Date;
}

const automation = resolve(__dirname, '..', 'automation');
const now = new Date();

getTags('mongo')
    .then(async (tags) => tags
        .filter(({ name, v2, images }: any) => v2 && Version.isVersionString(name) && images.some(({ architecture, os }: any) => architecture === 'amd64' && os === 'linux'))
        .map(({ name, digest, last_updated }: any) => {
            const version = new Version(name);
            return {
                name,
                version,
                digest,
                released: new Date(last_updated),
            };
        })
        // only preserve stable version (no build) and release candididates (-rcN)
        .filter(({ version: { build } }) => !build || /^rc\d+$/.test(build))
        // group by version (release candidates belong to the version) or digest (partial versions refer to full versions)
        .reduce((carry, item: any) => {
            const name = String(item.version);
            const found = carry.find((it: any) => String(it.version) === name || it.releases.some((rel: any) => rel.digest === item.digest));
            const record = found || { name, version: item.version, releases: [] };

            if (!found) {
                carry.push(record);
            }

            const release = record.releases.find((rel: any) => rel.name === item.name);

            if (release) {
                Object.keys(item).forEach((key) => {
                    release[key] = item[key];
                });
            }
            else {
                record.releases.push(item);
            }

            return carry;
        }, [] as Array<any>)
    )
    .then((bundles) => bundles.map((item: any) => {
        const [release] = item.releases.sort(({ version: a }: any, { version: b }: any) => a > b ? -1 : Number(a < b));

        return {
            ...item,
            // name: release.name,
            version: release.version,
            updated: release.released,
        };
    }))
    .then((bundles) => bundles.reduce((carry, bundle) => carry.then(async () => {
        const file = resolve(automation, 'collect', `v${bundle.version.major}`, bundle.name, 'meta.json');
        const meta = await readJSONFile<any>(file).catch(() => ({ name: bundle.name, version: String(bundle.version), catalog: [], releases: [], history: [], updated: now }));
        const removed = meta.releases.filter(({ name }: any) => !bundle.releases.find((rel: any) => name === rel.name));
        const added = bundle.releases.filter(({ name }: any) => !meta.releases.find((rel: any) => name === rel.name));
        const modified = bundle.releases
            .filter((rel: any) => !added.includes(rel))
            .filter((rel: any) => {
                const record = meta.releases.find(({ name }: any) => name === rel.name);

                if (record) {
                    return Object.keys(record).some((key: any) => record[key] !== rel[key]);
                }

                return false;
            });

        if (removed.length || added.length || modified.Length) {
            const found = meta.history.find((record: any) => record.date === now.getTime());
            const record = found || { type: meta.history.length ? 'UPDATE' : 'INITIAL', date: now.getTime(), actions: [] };

            removed.forEach((rel: any) => record.actions.push({ type: 'REMOVED', version: rel.version, name: rel.name, digest: rel.digest }));
            modified.forEach((rel: any) => {
                const before = meta.releases.find(({ name }: any) => name === rel.name);
                record.actions.push({ type: 'UPDATED', ...rel, before });
            });
            added.forEach((rel: any) => record.actions.push({ type: 'ADDED', version: rel.version, name: rel.name, digest: rel.digest }));

            if (!found) {
                meta.history.push(record);
            }
        }

        meta.releases = bundle.releases;

        await writeJSONFile(file, meta);
    }), Promise.resolve()))
    .then(() => {
        console.log('DONE');
    })