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

/**
 * Recursively assigns priorities for binary search bisection.
 * Stops recursion when a middle version has pending work.
 */
function recursiveBisect(
    versions: VersionWithMeta[],
    startIdx: number,
    endIdx: number,
    currentPriority: number,
    result: Map<string, { version: VersionWithMeta; priority: number }>
): void {
    // Find middle index
    const midIdx = Math.floor((startIdx + endIdx) / 2);

    // If middle === start or end, we're done with this range
    if (midIdx === startIdx || midIdx === endIdx) {
        return;
    }

    const middleVersion = versions[midIdx];

    // Assign priority to middle version if not already assigned
    if (!result.has(middleVersion.plan.version)) {
        result.set(middleVersion.plan.version, {
            version: middleVersion,
            priority: currentPriority,
        });

        debug &&
            console.log(
                `  Middle bisection: ${middleVersion.plan.version} = priority ${currentPriority}`
            );
    }

    // STOP if middle version has pending work
    if (middleVersion.plan.catalogs.length > 0) {
        debug &&
            console.log(
                `  Stopping recursion - ${middleVersion.plan.version} has pending work`
            );
        return;
    }

    // Middle is complete - check if we can skip based on checksum match
    const startVersion = versions[startIdx];
    const endVersion = versions[endIdx];

    const middleMatchesStart = versionsMatch(
        middleVersion.meta,
        startVersion.meta
    );
    const middleMatchesEnd = versionsMatch(middleVersion.meta, endVersion.meta);

    // If middle matches both start and end, all versions in range are identical
    if (middleMatchesStart && middleMatchesEnd) {
        debug &&
            console.log(
                `  Range ${startVersion.plan.version}-${endVersion.plan.version} all match - skipping`
            );
        return;
    }

    // Continue bisecting both halves
    const nextPriority = currentPriority + 1;

    recursiveBisect(versions, startIdx, midIdx, nextPriority, result);
    recursiveBisect(versions, midIdx, endIdx, nextPriority, result);
}

/**
 * Assigns priorities to versions within a major.minor group using binary search strategy.
 */
function assignGroupPriorities(
    versions: VersionWithMeta[]
): Map<string, { version: VersionWithMeta; priority: number }> {
    const result = new Map<
        string,
        { version: VersionWithMeta; priority: number }
    >();

    if (versions.length === 0) return result;

    // Sort by patch version (ascending: earliest to latest)
    const sorted = versions.sort(
        (a, b) => (a.version.patch || 0) - (b.version.patch || 0)
    );

    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];

    // Priority 1: Latest version
    result.set(latest.plan.version, {
        version: latest,
        priority: 1,
    });

    debug &&
        console.log(`  True latest: ${latest.plan.version} = priority 1`);

    // Priority 2: Earliest version (if different from latest)
    if (sorted.length > 1) {
        result.set(earliest.plan.version, {
            version: earliest,
            priority: 2,
        });

        debug &&
            console.log(`  True earliest: ${earliest.plan.version} = priority 2`);
    }

    // If only 1 or 2 versions, we're done
    if (sorted.length <= 2) {
        return result;
    }

    // Check if latest and earliest match
    const outputsMatch = versionsMatch(latest.meta, earliest.meta);

    if (outputsMatch) {
        // All versions in between are identical - skip them (priority 1000)
        debug &&
            console.log(
                `  Latest and earliest match - marking ${sorted.length - 2} middle versions as skipped`
            );

        for (let i = 1; i < sorted.length - 1; i++) {
            result.set(sorted[i].plan.version, {
                version: sorted[i],
                priority: 1000,
            });
        }
    } else {
        // Need bisection - start recursive middle assignment
        debug && console.log(`  Latest and earliest differ - starting bisection`);

        recursiveBisect(sorted, 0, sorted.length - 1, 3, result);
    }

    // Assign fallback priority (100 - pendingCount) to any unassigned versions
    for (const version of sorted) {
        if (!result.has(version.plan.version)) {
            const pendingCount = version.plan.catalogs.length;
            const fallbackPriority = 100 - pendingCount;

            result.set(version.plan.version, {
                version,
                priority: fallbackPriority,
            });

            debug &&
                console.log(
                    `  Unassigned: ${version.plan.version} = priority ${fallbackPriority} (100 - ${pendingCount} pending)`
                );
        }
    }

    return result;
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
        // Group ALL versions by major.minor (not just those with pending)
        const byMinor = allVersions.reduce(
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

        const allPrioritizedVersions: Array<{
            version: VersionWithMeta;
            priority: number;
        }> = [];

        // Process each minor version group
        for (const [minorKey, versions] of Object.entries(byMinor)) {
            debug &&
                console.log(
                    `\nProcessing ${minorKey}: ${versions.length} versions`
                );

            // Assign priorities within this group based on ALL versions
            const priorityMap = assignGroupPriorities(versions);

            // Convert map to array and add to overall list
            const groupPriorities = Array.from(priorityMap.values());
            allPrioritizedVersions.push(...groupPriorities);
        }

        // Filter to versions with pending work
        const withPending = allPrioritizedVersions.filter(
            (item) => item.version.plan.catalogs.length > 0
        );

        if (withPending.length === 0) {
            debug && console.log(JSON.stringify([]));
            return;
        }

        // Sort globally by priority (ascending = higher priority first)
        withPending.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            // Tie-breaker: higher major.minor.patch first
            const av = a.version.version;
            const bv = b.version.version;
            if (av.major !== bv.major) return bv.major - av.major;
            if (av.minor !== bv.minor) return (bv.minor || 0) - (av.minor || 0);
            return (bv.patch || 0) - (av.patch || 0);
        });

        // Take top 5
        const top5 = withPending.slice(0, 5);
        const finalPriorities = top5.map((item) => item.version.plan.version);

        debug && console.log('\n=== Final Priority List (Top 5) ===');
        debug &&
            top5.forEach((item, idx) => {
                console.log(
                    `${idx + 1}. ${item.version.plan.version} (priority ${item.priority})`
                );
            });

        console.log(JSON.stringify(finalPriorities));
    })
    .catch((error) => debug && console.error(error));
