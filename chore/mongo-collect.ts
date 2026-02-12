import { resolve, dirname } from 'node:path'
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
    resultChecksum?: string
}

type MetaData = {
    catalog: MetaCatalogEntry[]
    resultChecksum?: string
    completedCount?: number
    totalCount?: number
}

type Catalog = {
    name: string
    operations: any[]
    collection?: {
        records?: any[]
        indices?: any[]
    }
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

async function savePlan(
    versionDir: string,
    plan: VersionWorkPlan
): Promise<void> {
    const planFile = resolve(versionDir, 'plan.json')
    await writeJSONFile(planFile, plan)
}

async function loadMeta(versionDir: string): Promise<MetaData | null> {
    const metaFile = resolve(versionDir, 'meta.json')
    try {
        return await readJSONFile<MetaData>(metaFile)
    } catch {
        return null
    }
}

async function saveMeta(versionDir: string, meta: MetaData): Promise<void> {
    const metaFile = resolve(versionDir, 'meta.json')
    await writeJSONFile(metaFile, meta)
}

async function loadCatalog(item: CatalogWorkItem): Promise<Catalog> {
    const component = resolve(process.cwd(), item.path)
    const module = await import(component)
    const catalog = module[item.name]

    if (!catalog) {
        throw new Error(`Export '${item.name}' not found in module`)
    }

    return catalog
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

        const meta = (await loadMeta(versionDir)) || { catalog: [] }
        const db = await driver(dsn, version)
        let hasErrors = false

        for (const item of plan.catalogs) {
            let catalog: Catalog

            try {
                catalog = await loadCatalog(item)
            } catch (error: any) {
                console.error(`✗ ${item.name}: Catalog loading failed`)
                console.error(`  Error: ${error.message || String(error)}`)

                const entry: MetaCatalogEntry = {
                    name: item.name,
                    hash: item.hash,
                    failed: new Date().toISOString(),
                    error: `${error.message || String(error)}\n${error.stack || ''}`,
                }
                const existing = meta.catalog.find((m) => m.name === item.name)
                if (existing) {
                    Object.assign(existing, entry)
                } else {
                    meta.catalog.push(entry)
                }
                hasErrors = true
                continue
            }

            try {
                const { operations } = catalog
                const documents = catalog.collection?.records || []
                const indices = catalog.collection?.indices

                // Initialize collection with documents and indices
                await db.initCollection({
                    name: dsn.collection,
                    indices,
                    documents,
                })

                const result: Array<any> = []

                for (const operation of operations) {
                    const queryResult = await db.execute(operation)

                    const record: any = {
                        operation,
                        documents: queryResult.success
                            ? queryResult.documents
                            : undefined,
                        error: queryResult.success
                            ? undefined
                            : queryResult.error,
                    }

                    result.push(record)
                }

                // Drop collection after processing
                await db.dropCollection(dsn.collection)

                // Save results
                await writeJSONFile(
                    resolve(versionDir, `${item.name}.json`),
                    result
                )

                // Calculate checksum for this catalog's results
                const resultChecksum = hash(result)

                // Add to meta catalog as completed
                const entry: MetaCatalogEntry = {
                    name: item.name,
                    hash: item.hash,
                    completed: new Date().toISOString(),
                    resultChecksum,
                }
                const existing = meta.catalog.find((m) => m.name === item.name)
                if (existing) {
                    delete existing.failed
                    delete existing.error
                    Object.assign(existing, entry)
                } else {
                    meta.catalog.push(entry)
                }

                console.log(
                    `✓ ${item.name}: ${documents.length} docs, ${operations.length} queries`
                )
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

        // Calculate checksums and counts for meta
        const completedCatalogs = meta.catalog.filter((m) => m.completed && m.resultChecksum)
        const completedCount = completedCatalogs.length
        const totalCount = meta.catalog.length

        // Calculate combined checksum from sorted catalog:checksum pairs
        const sortedChecksums = completedCatalogs
            .map((c) => `${c.name}:${c.resultChecksum}`)
            .sort()
        const combinedChecksum =
            sortedChecksums.length > 0 ? hash(sortedChecksums.join('|')) : ''

        // Update meta with checksum and counts
        meta.resultChecksum = combinedChecksum
        meta.completedCount = completedCount
        meta.totalCount = totalCount

        console.log(`Saving plan with ${plan.catalogs.length} catalogs`)
        console.log(
            `Saving meta with ${meta.catalog.length} entries (${completedCount} completed)`
        )

        await savePlan(versionDir, plan)
        await saveMeta(versionDir, meta)

        // Verify save
        const verifyMeta = await loadMeta(versionDir)
        console.log(
            `Verified meta has ${verifyMeta?.catalog.length || 0} entries`
        )

        if (hasErrors) {
            console.error(
                'Completed with errors - check meta.json for failed catalogs'
            )
            process.exit(1)
        }
    })
    .catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
