import { resolve, dirname } from 'node:path';
import { glob } from 'glob';
import { Version } from '../source/domain/version';
import { readJSONFile, writeJSONFile } from '../source/domain/json';

const debug = process.env.DEBUG != undefined;

type CatalogWorkItem = {
    name: string;
    path: string;
    hash: string;
};

type VersionWorkPlan = {
    name?: string;
    version: string;
    catalogs: Array<CatalogWorkItem>;
    created: string;
    updated: string;
};

type MetaCatalogEntry = {
    name: string;
    hash: string;
    completed?: string;
    failed?: string;
    error?: string;
    resultChecksum?: string;
};

type MetaData = {
    name: string;
    version: string;
    catalog: MetaCatalogEntry[];
    releases: Array<{ name: string; [key: string]: unknown }>;
    resultChecksum?: string;
    completedCount?: number;
    totalCount?: number;
};

type VersionWithMeta = {
    plan: VersionWorkPlan;
    version: Version;
    meta: MetaData;
    versionDir: string;
};

const automation = resolve(__dirname, '..', 'automation');
const catalogFile = resolve(automation, 'catalog-queries.json');

async function loadExistingPlan(
    versionDir: string
): Promise<VersionWorkPlan | null> {
    const planFile = resolve(versionDir, 'plan.json');
    try {
        return await readJSONFile<VersionWorkPlan>(planFile);
    } catch {
        return null;
    }
}

async function savePlan(
    versionDir: string,
    plan: VersionWorkPlan
): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json');
    await writeJSONFile(planFile, plan);
}

function plansAreEqual(a: VersionWorkPlan, b: VersionWorkPlan | null): boolean {
    if (!b) return false;
    if (a.catalogs.length !== b.catalogs.length) return false;

    const aCatalogs = a.catalogs.map((c) => `${c.name}:${c.hash}`).sort();
    const bCatalogs = b.catalogs.map((c) => `${c.name}:${c.hash}`).sort();

    return JSON.stringify(aCatalogs) === JSON.stringify(bCatalogs);
}

async function loadMeta(metaFile: string): Promise<MetaData | null> {
    try {
        return await readJSONFile<MetaData>(metaFile);
    } catch {
        return null;
    }
}

function getVersionChecksum(meta: MetaData): string | undefined {
    return meta.resultChecksum;
}

function versionsMatch(meta1: MetaData, meta2: MetaData): boolean {
    const checksum1 = getVersionChecksum(meta1);
    const checksum2 = getVersionChecksum(meta2);

    // If both have combined checksums, compare those
    if (checksum1 && checksum2) {
        return checksum1 === checksum2;
    }

    // Otherwise, compare catalog by catalog
    const completed1 = meta1.catalog.filter(
        (c) => c.completed && c.resultChecksum
    );
    const completed2 = meta2.catalog.filter(
        (c) => c.completed && c.resultChecksum
    );

    if (completed1.length !== completed2.length) return false;

    for (const cat1 of completed1) {
        const cat2 = completed2.find((c) => c.name === cat1.name);
        if (!cat2 || cat1.resultChecksum !== cat2.resultChecksum) {
            return false;
        }
    }

    return true;
}

function binarySearchPriority(
    versions: VersionWithMeta[],
    startIdx: number,
    endIdx: number,
    priority: number,
    result: Map<string, { version: VersionWithMeta; priority: number }>
): number {
    if (startIdx > endIdx) return priority;

    // With ascending sort: startIdx = earliest (lowest patch), endIdx = latest (highest patch)
    const earliestVersion = versions[startIdx];
    const latestVersion = versions[endIdx];

    // Add latest with highest priority (1), earliest with next priority
    if (!result.has(latestVersion.plan.version)) {
        result.set(latestVersion.plan.version, {
            version: latestVersion,
            priority,
        });
        priority++;
    }
    if (startIdx !== endIdx && !result.has(earliestVersion.plan.version)) {
        result.set(earliestVersion.plan.version, {
            version: earliestVersion,
            priority,
        });
        priority++;
    }

    // If only 2 or fewer versions, we're done
    if (endIdx - startIdx <= 1) return priority;

    // Check if outputs match
    const outputsMatch = versionsMatch(
        latestVersion.meta,
        earliestVersion.meta
    );

    if (outputsMatch) {
        // All versions in between have same output - mark them with low priority
        for (let i = startIdx + 1; i < endIdx; i++) {
            if (!result.has(versions[i].plan.version)) {
                result.set(versions[i].plan.version, {
                    version: versions[i],
                    priority: 1000,
                });
            }
        }
        return priority;
    } else {
        // Outputs differ - need to binary search
        const midIdx = Math.floor((startIdx + endIdx) / 2);
        const midVersion = versions[midIdx];

        if (!result.has(midVersion.plan.version)) {
            result.set(midVersion.plan.version, {
                version: midVersion,
                priority,
            });
            priority++;
        }

        // Recurse on both halves
        priority = binarySearchPriority(
            versions,
            startIdx,
            midIdx,
            priority,
            result
        );
        priority = binarySearchPriority(
            versions,
            midIdx,
            endIdx,
            priority,
            result
        );

        return priority;
    }
}

readJSONFile<
    Array<{
        name: string;
        path: string;
        exports: Array<{ name: string; hash: string }>;
    }>
>(catalogFile)
    .then(async (catalog) => {
        // Flatten all catalog exports with their hashes
        const currentCatalogs = catalog.flatMap((record) =>
            record.exports.map((exp) => ({
                name: exp.name,
                path: record.path,
                hash: exp.hash,
            }))
        );

        const metaFiles = await glob(
            resolve(automation, 'collect', '**', 'meta.json')
        );
        const allVersions: VersionWithMeta[] = [];

        for (const metaFile of metaFiles) {
            const versionDir = dirname(metaFile);
            const meta = await loadMeta(metaFile);

            if (!meta) continue;

            const version = meta.name;
            const release = meta.releases[0]?.name;
            const existingPlan = await loadExistingPlan(versionDir);

            // Determine which catalogs need to be in the plan (pending only)
            const pendingCatalogs: CatalogWorkItem[] = [];

            for (const current of currentCatalogs) {
                const metaEntry = meta.catalog.find(
                    (m) => m.name === current.name
                );

                // If not in meta, or hash changed, or failed -> pending
                const needsRun =
                    !metaEntry ||
                    metaEntry.hash !== current.hash ||
                    metaEntry.failed !== undefined;

                if (needsRun) {
                    pendingCatalogs.push(current);
                }
            }

            const now = new Date().toISOString();
            const plan: VersionWorkPlan = {
                name: release,
                version,
                catalogs: pendingCatalogs,
                created: existingPlan?.created ?? now,
                updated: now,
            };

            // Only save if plan has changed
            if (!plansAreEqual(plan, existingPlan)) {
                await savePlan(versionDir, plan);
                debug &&
                    console.log(
                        `Updated plan for ${version}: ${pendingCatalogs.length} pending catalogs`
                    );
            } else {
                debug &&
                    console.log(
                        `Skipped saving plan for ${version} - no changes`
                    );
            }

            allVersions.push({
                plan,
                version: new Version(version),
                meta,
                versionDir,
            });
        }

        return allVersions;
    })
    .then((allVersions) => {
        // Filter to versions with pending work
        const withPending = allVersions.filter(
            (v) => v.plan.catalogs.length > 0
        );

        if (withPending.length === 0) {
            debug && console.log(JSON.stringify([]));
            return;
        }

        // Group by major.minor (e.g., "8.2", "7.0")
        const byMinor = withPending.reduce(
            (carry, item) => {
                const v = item.version;
                const key = `${v.major}.${v.minor || 0}`;
                if (!carry[key]) {
                    carry[key] = [];
                }
                carry[key].push(item);
                return carry;
            },
            {} as { [key: string]: VersionWithMeta[] }
        );

        const prioritizedVersions: Array<{
            version: VersionWithMeta;
            priority: number;
        }> = [];

        // Process each minor version group
        for (const [minorKey, versions] of Object.entries(byMinor)) {
            // Sort by patch version (ascending: 0, 1, 2...)
            const sortedVersions = versions.sort(
                (a, b) => (a.version.patch || 0) - (b.version.patch || 0)
            );

            debug &&
                console.log(
                    `\nProcessing ${minorKey} (sorted earliest→latest): ${sortedVersions.map((v) => v.plan.version).join(', ')}`
                );

            // Apply binary search prioritization
            const priorityMap = new Map<
                string,
                { version: VersionWithMeta; priority: number }
            >();
            binarySearchPriority(
                sortedVersions,
                0,
                sortedVersions.length - 1,
                1,
                priorityMap
            );

            // Convert map to array
            const groupPriorities = Array.from(priorityMap.values());

            // Sort by priority and add to overall list
            groupPriorities.sort((a, b) => a.priority - b.priority);
            prioritizedVersions.push(...groupPriorities);
        }

        // Group priorities by minor version for round-robin selection
        const prioritiesByMinor: {
            [key: string]: Array<{
                version: VersionWithMeta;
                priority: number;
            }>;
        } = {};
        for (const item of prioritizedVersions) {
            const v = item.version.version;
            const key = `${v.major}.${v.minor || 0}`;
            if (!prioritiesByMinor[key]) {
                prioritiesByMinor[key] = [];
            }
            prioritiesByMinor[key].push(item);
        }

        // Sort each minor group's priorities
        for (const key of Object.keys(prioritiesByMinor)) {
            prioritiesByMinor[key].sort((a, b) => a.priority - b.priority);
        }

        // Round-robin selection: take one from each group at a time
        const finalPriorities: string[] = [];
        const minorKeys = Object.keys(prioritiesByMinor).sort((a, b) => {
            // Sort by major version descending (so 8.x comes before 7.x)
            const majorA = parseInt(a.split('.')[0]);
            const majorB = parseInt(b.split('.')[0]);
            return majorB - majorA;
        });

        let round = 0;
        while (finalPriorities.length < 5 && minorKeys.length > 0) {
            let addedInRound = 0;

            for (const key of minorKeys) {
                if (finalPriorities.length >= 5) break;

                const group = prioritiesByMinor[key];
                if (round < group.length) {
                    const item = group[round];
                    // Use plan.name which contains the Docker-compatible version tag
                    finalPriorities.push(item.version.plan.version!);
                    addedInRound++;
                }
            }

            // If no items added in this round, we're done
            if (addedInRound === 0) break;
            round++;
        }

        debug && console.log('\nFinal priority list:', finalPriorities);
        console.log(JSON.stringify(finalPriorities));
    })
    .catch((error) => debug && console.error(error));
