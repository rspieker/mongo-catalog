import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

type Release = {
    version: string;
    name: string;
    updated: Date;
}
type VersionReleases = {
    version: string;
    releases: Array<Release>;
}
type NormalizedVersionRelease = {
    normalized: string;
    version: string;
    name: string;
    updated: Date;
};
type VersionHistory = any;

function readJSONFile(path: string): Promise<JSON> {
    return readFile(path)
        .then((buffer: Buffer) => buffer.toString('utf-8'))
        .then((utf8: string) => JSON.parse(utf8));
}

function fetchJSON<T>(url: string): Promise<T> {
    console.info(url);
    return fetch(url)
        .then((response) => response.json() as T);
}

async function getDockerVersions(url = 'https://registry.hub.docker.com/v2/repositories/library/mongo/tags?page_size=100'): Promise<Array<VersionHistory>> {
    const { next, results: data } = await fetchJSON<{ next?: string, results: Array<object> }>(url);

    if (next) {
        const append = await getDockerVersions(next);

        data.push(...append);
    }

    return data;
}

function compare(a: number | Date, b: number | Date): number {
    return a < b ? -1 : Number(a > b);
}

function joinValues(char: string, ...parts: Array<unknown>): string {
    return parts.filter(Boolean).join(char);
}

const versionPattern = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?(?:-(rc))?/;
const automation = resolve(__dirname, '..', 'automation');
const versionFile = resolve(automation, 'mongo-versions.json');
const started = new Date();

readJSONFile(versionFile)
    .catch(() => undefined)
    .then((result: unknown = []) => (Array.isArray(result) ? result : []) as Array<VersionHistory>)
    .then(async (history) => {
        const docker = await getDockerVersions();

        docker
            .filter(({ v2, name }) => v2 && versionPattern.test(name))
            .reduce((carry, { name, last_updated }) => {
                const [major, minor, patch, tag] = name.match(versionPattern).slice(1);
                const version = joinValues('.', major, minor, patch);
                const found = carry.find((record: any) => record.version === version);
                const record = found || { version, releases: [] };

                if (!found) carry.push(record);

                record.releases.push({ version: joinValues('-', version, tag), name, updated: new Date(last_updated) });

                return carry;
            }, [] as Array<VersionReleases>)
            .map(({ version, releases }: VersionReleases) => {
                const exact = releases.find((release) => release.name === version);

                if (exact) {
                    return { normalized: version, ...exact };
                }

                const [best = {}] = releases.sort(
                    ({ name: { length: la }, updated: ua }, { name: { length: lb }, updated: ub }) =>
                        // name length is the same
                        la === lb
                            // compare the update Date (DESC)
                            ? compare(ub, ua)
                            // compare name legth (shortest match wins)
                            : compare(la, lb)
                );

                return { normalized: version, ...best };
            })
            .forEach(({ normalized, version, name, updated }: NormalizedVersionRelease) => {
                const found = history.find((record) => record.version === normalized);
                const record = found || { version: normalized, name, released: updated, changes: [], modified: new Date() };

                if (found) {
                    const compare = { version: normalized, name };
                    const changed = (Object.keys(compare) as Array<keyof typeof compare>)
                        .filter((key) => compare[key] !== record[key as keyof typeof record]);

                    if (changed.length) {
                        const before: Partial<typeof record> = {};
                        record.changes.push({
                            type: 'update',
                            before,
                            timestamp: Date.now(),
                        });

                        changed.forEach((key) => {
                            before[key] = record[key];
                            record[key] = compare[key];
                        });

                        record.modified = new Date();
                    }
                }
                else {
                    record.changes.push({
                        type: 'initial',
                        timestamp: Date.now(),
                    });
                    history.push(record);
                }
            });

        return history;
    })
    .then((history) => writeFile(versionFile, JSON.stringify(history, null, '\t')))
    ;