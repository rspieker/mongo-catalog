import { resolve, dirname } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { glob } from 'glob'
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

async function loadExistingPlan(versionDir: string): Promise<VersionWorkPlan | null> {
    const planFile = resolve(versionDir, 'plan.json')
    try {
        return await readJSONFile<VersionWorkPlan>(planFile)
    } catch {
        return null
    }
}

async function savePlan(versionDir: string, plan: VersionWorkPlan): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json')
    await writeFile(planFile, JSON.stringify(plan, null, '\t'))
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
                const metaEntry = meta.catalog.find((m) => m.name === current.name)
                
                // If not in meta, or hash changed, or failed -> pending
                const needsRun = !metaEntry || 
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
        // Output summary
        const summary = plans.map((plan) => ({
            version: plan.version,
            pending: plan.catalogs.length,
        }))

        console.log(JSON.stringify(summary, null, '\t'))
    })
    .catch(console.error)
