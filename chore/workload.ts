import { resolve, dirname } from 'node:path'
import { glob } from 'glob'
import { Version } from '../source/domain/version'
import { readJSONFile, writeJSONFile } from '../source/domain/json'

type CatalogWorkItem = {
    name: string
    path: string
    hash: string
}

type VersionWorkPlan = {
    version: string
    catalogs: CatalogWorkItem[]
    created: string
    updated: string
}

type MetaCatalogEntry = {
    name: string
    hash: string
    completed?: string
    failed?: string
    error?: string
}

const automation = resolve(__dirname, '..', 'automation')
const catalogFile = resolve(automation, 'catalog-queries.json')

async function loadExistingPlan(
    versionDir: string
): Promise<VersionWorkPlan | null> {
    const planFile = resolve(versionDir, 'plan.json')
    try {
        return await readJSONFile<VersionWorkPlan>(planFile)
    } catch {
        return null
    }
}

async function savePlan(
    versionDir: string,
    plan: VersionWorkPlan
): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json')
    await writeJSONFile(planFile, plan)
}

readJSONFile<
    Array<{
        name: string
        path: string
        exports: Array<{ name: string; hash: string }>
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
        )

        const metaFiles = await glob(
            resolve(automation, 'collect', '**', 'meta.json')
        )
        const plans: VersionWorkPlan[] = []

        for (const metaFile of metaFiles) {
            const versionDir = dirname(metaFile)
            const meta = await readJSONFile<{
                name: string
                version: string
                catalog: MetaCatalogEntry[]
            }>(metaFile)

            const version = meta.name
            const existingPlan = await loadExistingPlan(versionDir)

            // Determine which catalogs need to be in the plan (pending only)
            const pendingCatalogs: CatalogWorkItem[] = []

            for (const current of currentCatalogs) {
                const metaEntry = meta.catalog.find(
                    (m) => m.name === current.name
                )

                // If not in meta, or hash changed, or failed -> pending
                const needsRun =
                    !metaEntry ||
                    metaEntry.hash !== current.hash ||
                    metaEntry.failed !== undefined

                if (needsRun) {
                    pendingCatalogs.push(current)
                }
            }

            const now = new Date().toISOString()
            const plan: VersionWorkPlan = {
                version,
                catalogs: pendingCatalogs,
                created: existingPlan?.created ?? now,
                updated: now,
            }

            await savePlan(versionDir, plan)
            plans.push(plan)
        }

        return plans
    })
    .then((plans) => {
        // Filter to versions with pending work
        const withPending = plans.filter((p) => p.catalogs.length > 0)

        if (withPending.length === 0) {
            console.log(JSON.stringify([]))
            return
        }

        // Group by major.minor (e.g., "8.2", "7.0") and calculate distance from latest
        const byMinor = withPending.reduce(
            (carry, plan) => {
                const v = new Version(plan.version)
                const key = `${v.major}.${v.minor || 0}`
                if (!carry[key]) {
                    carry[key] = []
                }
                carry[key].push({ plan, version: v })
                return carry
            },
            {} as {
                [key: string]: Array<{
                    plan: (typeof withPending)[0]
                    version: Version
                }>
            }
        )

        // For each minor group, pick the version furthest from latest (highest distance)
        const groupReps = Object.entries(byMinor).map(([_, group]) => {
            // Find latest patch version in this minor group
            const maxPatch = Math.max(...group.map((g) => g.version.patch || 0))

            // Find the version with highest distance in this group
            const furthestBehind = group
                .map(({ plan, version }) => ({
                    plan,
                    distance: maxPatch - (version.patch || 0),
                    version,
                }))
                .sort((a, b) => b.distance - a.distance)[0]

            return furthestBehind
        })

        // Sort representatives by distance descending, then major version descending
        const prioritized = groupReps
            .sort((a, b) => {
                if (b.distance !== a.distance) {
                    return b.distance - a.distance // Higher distance first
                }
                return b.version.major - a.version.major // Higher major first
            })
            .slice(0, 5)
            .map((p) => p.plan.version)

        console.log(JSON.stringify(prioritized))
    })
    .catch(console.error)
