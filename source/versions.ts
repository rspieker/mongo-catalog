import type { Dirent } from 'node:fs';
import { resolve } from 'node:path';
import { files } from './domain/filesystem';
import { readJSONFile, writeJSONFile } from './domain/json';
import { type DockerTag, getTags } from "./domain/docker";
import { Version } from "./domain/version";

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
const versions = resolve(automation, 'versions.json');
const collation = new Intl.Collator('en', { numeric: true });
const date = new Date();

readJSONFile(versions)
    .catch(async () => {
        const items: Array<Dirent> = await files(resolve(automation, 'collect'), true);
        const compiled: any = {
            modified: new Date().toISOString(),
            versions: [],
        };

        for (const item of items) {
            if (item.name !== 'meta.json') {
                continue;
            }
            const json: any = await readJSONFile(resolve(item.path, item.name));
            compiled.versions.push({
                name: json.name,
                modified: new Date(json.history.map(({ date }: any) => date).sort((a: number, b: number) => a > b ? -1 : Number(a < b))[0]).toISOString(),
                version: json.version,
                releases: json.releases,
            })
        }

        await writeJSONFile(versions, compiled);

        return compiled;
    })
    .then(async (collection) => {
        const images = await getTags<DockerTag>('mongo').then(async (tags) => tags
            .filter(({ name, v2, images }) => v2 && Version.isVersionString(name) && images.some(({ architecture, os }: any) => architecture === 'amd64' && os === 'linux'))
            .map(({ name, digest, last_updated, images }) => {
                const version = new Version(name);
                const checksum = digest || images.find(({ architecture, os }: any) => architecture === 'amd64' && os === 'linux')?.digest;

                return <BasicDockerTag>{
                    name,
                    version,
                    digest: checksum,
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
        );

        for (const image of images) {
            const { name, version, releases } = image;
            const found = collection.versions.find((c: any) => c.name === name);
            const record = found || { name, modified: null, version: String(version), releases: [] };

            if (!found) {
                collection.versions.push(record);
            }

            const removed = record.releases.filter(({ name }: any) => !releases.find((r: any) => r.name === name));
            const added = releases.filter(({ name }) => !record.releases.find((r: any) => r.name === name));
            const modified = releases
                .filter((rel: any) => !added.includes(rel))
                .filter((rel: any) => {
                    const item = record.releases.find(({ name }: any) => name === rel.name);

                    if (item) {
                        return Object.keys(record).some((key: any) => JSON.stringify(item[key]) !== JSON.stringify(rel[key]));
                    }

                    return false;
                });

            if (added.length || modified.length || removed.length) {
                record.releases.push(...added);
                removed.forEach((rel: any) => record.releases.splice(record.releases.indexOf(rel), 1));
                modified.forEach((rel: any) => {
                    const found = record.releases.find((rec: any) => rec.name === rel.name);
                    Object.keys(rel).filter((key) => key in found).forEach((key) => found[key] = rel[key]);
                });
                record.modified = new Date().toISOString();
                collection.modified = record.modified;
                record.releases.sort(({ version: a }: any, { version: b }: any) => collation.compare(String(a.version), String(b.version)) * (Number(a.build === b.build) * -1) || a > b ? -1 : Number(a < b));
            }
        }

        collection.versions = collection.versions.sort(({ modified: a }: any, { modified: b }: any) => collation.compare(a, b) * -1);

        return collection;
    })
    .then((collection) => writeJSONFile(versions, collection))
    ;
