import { resolve, dirname } from 'node:path'
import { stat } from 'node:fs/promises'
import { hash } from '@konfirm/checksum'
import { Version } from '../source/domain/version'
import { readJSONFile, writeJSONFile } from '../source/domain/json'
import { driver } from '../source/domain/mongo/driver'
import { DSN } from '../source/domain/mongo/dsn'

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

const { MONGO_VERSION = '8' } = process.env
const automation = resolve(__dirname, '..', 'automation')
const version = new Version(MONGO_VERSION)
const dsn = new DSN('/MongoCatalog/CatalogCollection')

async function loadPlan(version: Version): Promise<VersionWorkPlan | null> {
    const planFile = resolve(
        automation,
        'collect',
        `v${version.major}`,
        String(version),
        'plan.json'
    )
    try {
        return await readJSONFile<VersionWorkPlan>(planFile)
    } catch {
        return null
    }
}

async function savePlan(versionDir: string, plan: VersionWorkPlan): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json')
    await writeJSONFile(planFile, plan)
}

async function loadMeta(versionDir: string): Promise<{ catalog: MetaCatalogEntry[] } | null> {
    const metaFile = resolve(versionDir, 'meta.json')
    try {
        return await readJSONFile<{ catalog: MetaCatalogEntry[] }>(metaFile)
    } catch {
        return null
    }
}

async function saveMeta(versionDir: string, meta: { catalog: MetaCatalogEntry[] }): Promise<void> {
    const metaFile = resolve(versionDir, 'meta.json')
    await writeJSONFile(metaFile, meta)
}

Promise.resolve()
    .then(() => loadPlan(version))
    .then(async (plan) => {
        if (!plan) {
            console.log(`No plan found for version ${version}`)
            return
        }

        if (plan.catalogs.length === 0) {
            console.log(`No pending catalogs for version ${version}`)
            return
        }

        console.log(`Processing ${plan.catalogs.length} pending catalogs...`)
        
        const versionDir = resolve(
            automation,
            'collect',
            `v${version.major}`,
            String(version)
        )
        
        const meta = await loadMeta(versionDir) || { catalog: [] }
        const db = await driver(dsn, version)
        let hasErrors = false

        for (const item of plan.catalogs) {
            const component = resolve(process.cwd(), item.path)
            const exists = await stat(component).then(() => true).catch(() => false)

            if (!exists) {
                // Mark as failed in meta
                const entry: MetaCatalogEntry = {
                    name: item.name,
                    hash: item.hash,
                    failed: new Date().toISOString(),
                    error: 'File not found',
                }
                const existing = meta.catalog.find((m) => m.name === item.name)
                if (existing) {
                    Object.assign(existing, entry)
                } else {
                    meta.catalog.push(entry)
                }
                hasErrors = true
                console.error(`✗ ${item.name}: File not found`)
                continue
            }

            try {
                const module: any = await import(component)
                const { operations, collection } = module
                
                // Initialize collection with documents and indices
                await db.initCollection({
                    name: dsn.collection,
                    indices: collection?.indices,
                    documents: collection?.records || [],
                })

                const result: Array<any> = []

                for (const operation of operations) {
                    const queryResult = await db.execute(operation)
                    
                    const record: any = { 
                        operation,
                        documents: queryResult.success ? queryResult.documents : undefined,
                        error: queryResult.success ? undefined : queryResult.error,
                    }

                    result.push(record)
                }

                // Drop collection after processing
                await db.dropCollection(dsn.collection)

                // Save results
                const resultHash = hash(result, 'sha256', 'hex')
                await writeJSONFile(
                    resolve(versionDir, `${item.name}.json`),
                    result
                )

                // Add to meta catalog as completed
                const entry: MetaCatalogEntry = {
                    name: item.name,
                    hash: resultHash,
                    completed: new Date().toISOString(),
                }
                const existing = meta.catalog.find((m) => m.name === item.name)
                if (existing) {
                    // Clear any previous failed status
                    delete existing.failed
                    delete existing.error
                    Object.assign(existing, entry)
                } else {
                    meta.catalog.push(entry)
                }

                console.log(`✓ ${item.name}`)
            } catch (error: any) {
                // Add to meta catalog as failed
                const entry: MetaCatalogEntry = {
                    name: item.name,
                    hash: item.hash,
                    failed: new Date().toISOString(),
                    error: error.message || String(error),
                }
                const existing = meta.catalog.find((m) => m.name === item.name)
                if (existing) {
                    Object.assign(existing, entry)
                } else {
                    meta.catalog.push(entry)
                }
                hasErrors = true
                console.error(`✗ ${item.name}: ${entry.error}`)
            }
        }

        await db.disconnect()

        // Clear plan catalogs (all processed) and update timestamp
        plan.catalogs = []
        plan.updated = new Date().toISOString()
        
        await savePlan(versionDir, plan)
        await saveMeta(versionDir, meta)

        if (hasErrors) {
            process.exit(1)
        }
    })
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
