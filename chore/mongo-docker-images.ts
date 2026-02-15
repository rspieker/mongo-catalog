import { resolve } from 'path'
import { type DockerTag, getTags } from '../source/domain/docker'
import { Version } from '../source/domain/version'
import { readJSONFile, writeJSONFile } from '../source/domain/json'
import { readdir, rm } from 'fs/promises'

type BasicDockerTag = {
    name: DockerTag['name']
    version: Version
    digest: DockerTag['digest']
    released: Date
}

type BasicDockerTagBundle = {
    name: DockerTag['name']
    version: Version
    releases: Array<BasicDockerTag>
}

const automation = resolve(__dirname, '..', 'automation')
const now = new Date()
const collation = new Intl.Collator('en', { numeric: true })

getTags<DockerTag>('mongo')
    .then(async (tags: Array<any>) =>
        tags
            .filter(
                ({ name, v2, images }) =>
                    v2 &&
                    Version.isVersionString(name) &&
                    images.some(
                        ({ architecture, os }: any) =>
                            architecture === 'amd64' && os === 'linux'
                    )
            )
            .map(({ name, digest, last_updated, images }) => {
                const version = new Version(name)
                const checksum =
                    digest ||
                    images.find(
                        ({ architecture, os }: any) =>
                            architecture === 'amd64' && os === 'linux'
                    )?.digest

                return <BasicDockerTag>{
                    name,
                    version,
                    digest: checksum,
                    released: new Date(last_updated),
                }
            })
            // only preserve stable version (no build) and release candididates (-rcN)
            .filter(({ version: { build } }) => !build || /^rc\d+$/.test(build))
            // group by version (release candidates belong to the version) or digest (partial versions refer to full versions)
            .reduce((carry, item: BasicDockerTag) => {
                const name = String(item.version)
                const found = carry.find(
                    (it: any) =>
                        String(it.version) === name ||
                        it.releases.some(
                            (rel: any) => rel.digest === item.digest
                        )
                )
                const record = found || {
                    name,
                    version: item.version,
                    releases: [],
                }

                if (!found) {
                    carry.push(record)
                } else if (found && name.length > found.name.length) {
                    // Use the longest version when multiple tags point to same image
                    // name is already normalized (String(item.version)), so "3.3.15" > "3.3.0"
                    found.name = name
                    found.version = item.version
                }

                const release = record.releases.find(
                    (rel: any) => rel.name === item.name
                )

                if (release) {
                    const keys = Object.keys(item) as Array<
                        keyof BasicDockerTag
                    >

                    keys.forEach((key) => {
                        release[key] = <any>item[key]
                    })
                } else {
                    record.releases.push(item)
                }

                return carry
            }, [] as Array<BasicDockerTagBundle>)
    )
    .then((bundles: Array<BasicDockerTagBundle>) =>
        bundles.map((item: BasicDockerTagBundle) => {
            const [release] = item.releases.sort(
                ({ version: a }: any, { version: b }: any) =>
                    a > b ? -1 : Number(a < b)
            )

            return {
                ...item,
                // name: release.name,
                version: release.version,
                updated: release.released,
            }
        })
    )
    .then((bundles: Array<BasicDockerTagBundle>) =>
        bundles.reduce(
            (carry, bundle) =>
                carry.then(async () => {
                    const file = resolve(
                        automation,
                        'collect',
                        `v${bundle.version.major}`,
                        bundle.name,
                        'meta.json'
                    )
                    const meta = await readJSONFile<any>(file).catch(() => ({
                        name: bundle.name,
                        version: String(bundle.version),
                        releases: [],
                        history: [],
                    }))
                    const removed = meta.releases.filter(
                        ({ name }: any) =>
                            !bundle.releases.find(
                                (rel: any) => name === rel.name
                            )
                    )
                    const added = bundle.releases.filter(
                        ({ name }: any) =>
                            !meta.releases.find((rel: any) => name === rel.name)
                    )
                    const modified = bundle.releases
                        .filter((rel: any) => !added.includes(rel))
                        .filter((rel: any) => {
                            const record = meta.releases.find(
                                ({ name }: any) => name === rel.name
                            )

                            if (record) {
                                return Object.keys(record).some(
                                    (key: any) =>
                                        JSON.stringify(record[key]) !==
                                        JSON.stringify(rel[key])
                                )
                            }

                            return false
                        })

                    // Add version-retracted records for removed releases
                    removed.forEach((rel: any) => {
                        meta.history.push({
                            type: 'version-retracted',
                            date: now.toISOString(),
                            name: rel.name,
                        })
                    })

                    // Add version-discovered records for added releases
                    added.forEach((rel: any) => {
                        meta.history.push({
                            type: 'version-discovered',
                            date: now.toISOString(),
                            name: rel.name,
                            digest: rel.digest,
                        })
                    })

                    // Note: Modified releases are not tracked in the new format
                    // The release data itself is updated in meta.releases

                    meta.releases = bundle.releases.sort(
                        ({ version: a }: any, { version: b }: any) =>
                            collation.compare(a.version, b.version) *
                                (Number(a.build === b.build) * -1) || a > b
                                ? -1
                                : Number(a < b)
                    )

                    await writeJSONFile(file, meta)
                }),
            Promise.resolve()
        )
    )
    .then(async () => {
        // Clean up duplicate version directories
        // (shorter versions that have same digest as longer versions)
        console.log('Cleaning up duplicate version directories...')
        const collectDir = resolve(automation, 'collect')
        
        for (let major = 2; major <= 8; major++) {
            const majorDir = resolve(collectDir, `v${major}`)
            try {
                const versions = await readdir(majorDir)
                const versionMeta: { name: string; digests: Set<string> }[] = []
                
                for (const v of versions) {
                    const metaFile = resolve(majorDir, v, 'meta.json')
                    try {
                        const meta = await readJSONFile<any>(metaFile)
                        const digests = new Set<string>(meta.releases?.map((r: any) => r.digest) || [])
                        versionMeta.push({ name: v, digests })
                    } catch {
                        // Skip if meta.json doesn't exist
                    }
                }
                
                // Find duplicates: shorter version whose digest matches a longer version's digest
                for (const short of versionMeta) {
                    for (const long of versionMeta) {
                        if (short.name.length < long.name.length) {
                            // Check if they share any digest
                            for (const digest of short.digests) {
                                if (long.digests.has(digest)) {
                                    console.log(`Removing duplicate: ${short.name} (same as ${long.name})`)
                                    await rm(resolve(majorDir, short.name), { recursive: true, force: true })
                                    break
                                }
                            }
                        }
                    }
                }
            } catch {
                // Major version directory doesn't exist, skip
            }
        }
        console.log('DONE')
    })
