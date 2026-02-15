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

type CollectionCompletedRecord = {
    type: 'collection-completed';
    date: string;
    catalog: string;
    hash: string;
    resultChecksum: string;
};

type CollectionHaltedRecord = {
    type: 'collection-halted';
    date: string;
    catalog: string;
    reason: string;
};

type VersionDiscoveredRecord = {
    type: 'version-discovered';
    date: string;
    name: string;
    digest: string;
};

type VersionRetractedRecord = {
    type: 'version-retracted';
    date: string;
    name: string;
};

type HistoryRecord = CollectionCompletedRecord | CollectionHaltedRecord | VersionDiscoveredRecord | VersionRetractedRecord;

type MetaData = {
    name: string;
    version: string;
    releases: Array<{ name: string; [key: string]: unknown }>;
    history: HistoryRecord[];
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
    // Calculate combined checksum from all PROCESSED records
    const processed = meta.history.filter((h): h is CollectionCompletedRecord => h.type === 'collection-completed');
    if (processed.length === 0) return undefined;
    
    // Sort by catalog name for consistent ordering
    const sorted = processed
        .map(p => `${p.catalog}:${p.resultChecksum}`)
        .sort();
    
    // Simple hash combining (not cryptographically secure but sufficient for comparison)
    return sorted.join('|');
}

function versionsMatch(meta1: MetaData, meta2: MetaData): boolean {
    const checksum1 = getVersionChecksum(meta1);
    const checksum2 = getVersionChecksum(meta2);

    // If both have combined checksums, compare those
    if (checksum1 && checksum2) {
        return checksum1 === checksum2;
    }

    // Otherwise, compare catalog by catalog using PROCESSED records
    const processed1 = meta1.history.filter((h): h is CollectionCompletedRecord => h.type === 'collection-completed');
    const processed2 = meta2.history.filter((h): h is CollectionCompletedRecord => h.type === 'collection-completed');

    if (processed1.length !== processed2.length) return false;

    for (const p1 of processed1) {
        const p2 = processed2.find((p) => p.catalog === p1.catalog);
        if (!p2 || p1.resultChecksum !== p2.resultChecksum) {
            return false;
        }
    }

    return true;
}

/**
 * Gets skip information from meta history
 * Finds the current failure sequence (consecutive FAILED records since last PROCESSED or start)
 */
function getSkipInfo(meta: MetaData): {
    isInFailureSequence: boolean;
    firstFailureDate: Date | null;
    failureCount: number;
} {
    if (!meta.history || meta.history.length === 0) {
        return {
            isInFailureSequence: false,
            firstFailureDate: null,
            failureCount: 0,
        };
    }

    // Find the index of the most recent PROCESSED record
    let lastProcessedIndex = -1;
    for (let i = meta.history.length - 1; i >= 0; i--) {
        if (meta.history[i].type === 'collection-completed') {
            lastProcessedIndex = i;
            break;
        }
    }

    // Get all FAILED records after the last PROCESSED (or from start if none)
    // Also check for legacy 'FAILED' type for backwards compatibility
    const failureStartIndex = lastProcessedIndex + 1;
    const failedRecords = meta.history
        .slice(failureStartIndex)
        .filter(h => h.type === 'collection-halted' || (h as any).type === 'FAILED');

    if (failedRecords.length === 0) {
        return {
            isInFailureSequence: false,
            firstFailureDate: null,
            failureCount: 0,
        };
    }

    // Get the first failure in the current sequence
    const firstFailure = failedRecords[0];

    return {
        isInFailureSequence: true,
        firstFailureDate: new Date(firstFailure.date),
        failureCount: failedRecords.length,
    };
}

/**
 * Checks if a version in a failure sequence should be retried based on exponential backoff
 * Retry intervals from first failure: 1, 2, 4, 8, 16... days
 * Once the wait period is reached, the version stays eligible until it succeeds
 */
function shouldRetrySkip(meta: MetaData): boolean {
    const skipInfo = getSkipInfo(meta);
    if (!skipInfo.isInFailureSequence) return false;
    if (!skipInfo.firstFailureDate) return true; // First failure, eligible immediately

    const daysSinceFirstFailure =
        (Date.now() - skipInfo.firstFailureDate.getTime()) / 86400000;
    const retryInterval = Math.pow(2, skipInfo.failureCount - 1);

    // Eligible if we've waited long enough since the first failure
    return daysSinceFirstFailure >= retryInterval;
}

/**
 * Calculates priority for versions in failure sequences
 * Base 1000, minus failure count (older failures = higher priority)
 */
function getSkipPriority(meta: MetaData): number {
    const skipInfo = getSkipInfo(meta);
    // Priority 1000 - failureCount (1 failure = 999, 5 failures = 995, etc.)
    return 1000 - skipInfo.failureCount;
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
    // For versions in failure sequences that are due for retry, use failure-based priority (1000 - failureCount)
    for (const version of sorted) {
        if (!result.has(version.plan.version)) {
            let priority: number;
            const skipInfo = getSkipInfo(version.meta);
            
            if (skipInfo.isInFailureSequence) {
                // Versions in failure sequences get priority based on failure count
                priority = getSkipPriority(version.meta);
                debug &&
                    console.log(
                        `  Version in failure sequence: ${version.plan.version} = priority ${priority} (failure-based)`
                    );
            } else {
                const pendingCount = version.plan.catalogs.length;
                priority = 100 - pendingCount;
                debug &&
                    console.log(
                        `  Unassigned: ${version.plan.version} = priority ${priority} (100 - ${pendingCount} pending)`
                    );
            }

            result.set(version.plan.version, {
                version,
                priority,
            });
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

            // Handle versions in failure sequences - check if they should be retried
            const skipInfo = getSkipInfo(meta);
            if (skipInfo.isInFailureSequence) {
                if (shouldRetrySkip(meta)) {
                    debug && console.log(`Including version ${meta.name} in failure sequence - retry due`);
                    // Continue processing but will get special priority later
                } else {
                    debug && console.log(`Skipping ${meta.name} - not due for retry yet`);
                    continue;
                }
            }

            const version = meta.name;
            const release = meta.releases[0]?.name;
            const existingPlan = await loadExistingPlan(versionDir);

            // Determine which catalogs need to be in the plan (pending only)
            const pendingCatalogs: CatalogWorkItem[] = [];

            for (const current of currentCatalogs) {
                // Find the most recent PROCESSED record for this catalog
                const processedRecords = meta.history.filter(
                    (h): h is CollectionCompletedRecord => h.type === 'collection-completed' && h.catalog === current.name
                );
                const latestProcessed = processedRecords.length > 0
                    ? processedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                    : null;

                // If no PROCESSED record exists, or hash changed -> pending
                const needsRun = !latestProcessed || latestProcessed.hash !== current.hash;

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
        
        // Check if all selected versions are in failure sequences (retry mode)
        const allSkipped = top5.every((item) => getSkipInfo(item.version.meta).isInFailureSequence);

        debug && console.log('\n=== Final Priority List (Top 5) ===');
        debug &&
            top5.forEach((item, idx) => {
                console.log(
                    `${idx + 1}. ${item.version.plan.version} (priority ${item.priority})`
                );
            });

        // Output JSON with mode indicator
        const output = {
            versions: finalPriorities,
            mode: allSkipped ? 'retry-skipped' : 'normal'
        };
        console.log(JSON.stringify(output));
    })
    .catch((error) => debug && console.error(error));
