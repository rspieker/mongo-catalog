import { resolve } from "path";
import { type DockerTag, getTags } from "../source/domain/docker";
import { Version } from "../source/domain/version";
import { readJSONFile, writeJSONFile } from "../source/domain/json";

type BasicDockerTag = {
    name: DockerTag['name'];
    version: Version;
    digest: DockerTag['digest'];
    released: Date;
}

type BasicDockerTagBundle = {
    name: DockerTag['name'];
    version: Version;
    releases: Array<BasicDockerTag>;
};

const automation = resolve(__dirname, '..', 'automation');
const now = new Date();
const collation = new Intl.Collator('en', { numeric: true });

getTags<DockerTag>('mongo')
    .then(async (tags) => tags
        .filter(({ name, v2, images }) => v2 && Version.isVersionString(name) && images.some(({ architecture, os }: any) => architecture === 'amd64' && os === 'linux'))
        .map(({ name, digest, last_updated }) => {
            const version = new Version(name);

            return <BasicDockerTag>{
                name,
                version,
                digest,
                released: new Date(last_updated),
            };
        })
        // only preserve stable version (no build) and release candididates (-rcN)
        .filter(({ version: { build } }) => !build || /^rc\d+$/.test(build))
        // group by version (release candidates belong to the version) or digest (partial versions refer to full versions)
        .reduce((carry, item: BasicDockerTag) => {
            const name = String(item.version);
            const found = carry.find((it: any) => String(it.version) === name || it.releases.some((rel: any) => rel.digest === item.digest));
            const record = found || { name, version: item.version, releases: [] };

            if (!found) {
                carry.push(record);
            }

            const release = record.releases.find((rel: any) => rel.name === item.name);

            if (release) {
                const keys = Object.keys(item) as Array<keyof BasicDockerTag>;

                keys.forEach((key) => {
                    release[key] = <any>item[key];
                });
            }
            else {
                record.releases.push(item);
            }

            return carry;
        }, [] as Array<BasicDockerTagBundle>)
    )
    .then((bundles: Array<BasicDockerTagBundle>) => bundles.map((item: BasicDockerTagBundle) => {
        const [release] = item.releases.sort(({ version: a }: any, { version: b }: any) => a > b ? -1 : Number(a < b));

        return {
            ...item,
            // name: release.name,
            version: release.version,
            updated: release.released,
        };
    }))
    .then((bundles: Array<BasicDockerTagBundle>) => bundles.reduce((carry, bundle) => carry.then(async () => {
        const file = resolve(automation, 'collect', `v${bundle.version.major}`, bundle.name, 'meta.json');
        const meta = await readJSONFile<any>(file)
            .catch(() => ({ name: bundle.name, version: String(bundle.version), catalog: [], releases: [], history: [], updated: now }));
        const removed = meta.releases.filter(({ name }: any) => !bundle.releases.find((rel: any) => name === rel.name));
        const added = bundle.releases.filter(({ name }: any) => !meta.releases.find((rel: any) => name === rel.name));
        const modified = bundle.releases
            .filter((rel: any) => !added.includes(rel))
            .filter((rel: any) => {
                const record = meta.releases.find(({ name }: any) => name === rel.name);

                if (record) {
                    return Object.keys(record).some((key: any) => JSON.stringify(record[key]) !== JSON.stringify(rel[key]));
                }

                return false;
            });

        if (removed.length || added.length || modified.length) {
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

        meta.releases = bundle.releases.sort(({ version: a }: any, { version: b }: any) => collation.compare(a.version, b.version) * (Number(a.build === b.build) * -1) || a > b ? -1 : Number(a < b));

        await writeJSONFile(file, meta);
    }), Promise.resolve()))
    .then(() => {
        console.log('DONE');
    })