import { resolve } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { hash } from '@konfirm/checksum'

type CatalogWorkItem = {
    name: string
    path: string
    hash: string
}

type CatalogFixture = {
    name: string
    operations: unknown[]
    indices?: unknown[]
    documents: unknown[]
    generatedAt: string
}

const automation = resolve(__dirname, '..', 'automation')
const fixturesDir = resolve(automation, 'fixtures')
const catalogFile = resolve(automation, 'catalog-queries.json')

async function readJSONFile<T>(path: string): Promise<T> {
    const data = await readFile(path, 'utf-8')
    return JSON.parse(data)
}

async function writeJSONFile(path: string, data: unknown): Promise<void> {
    await writeFile(path, JSON.stringify(data, null, '\t'))
}

async function loadOrGenerateFixture(
    item: CatalogWorkItem
): Promise<CatalogFixture> {
    const fixtureFile = resolve(fixturesDir, `${item.name}.json`)

    // Try to load existing fixture
    try {
        const existing = await readJSONFile<CatalogFixture>(fixtureFile)
        // Check if it matches the expected hash
        const fixtureHash = hash(
            JSON.stringify(existing.documents),
            'sha256',
            'hex'
        )
        if (fixtureHash === item.hash) {
            console.log(`✓ ${item.name}: Fixture up to date`)
            return existing
        }
        console.log(`↻ ${item.name}: Fixture outdated, regenerating...`)
    } catch {
        console.log(`↻ ${item.name}: Fixture not found, generating...`)
    }

    // Generate from catalog
    const component = resolve(process.cwd(), item.path)
    const module = await import(component)
    const catalog = module[item.name]

    if (!catalog) {
        throw new Error(`Export '${item.name}' not found in module`)
    }

    const fixture: CatalogFixture = {
        name: item.name,
        operations: catalog.operations,
        indices: catalog.collection?.indices,
        documents: catalog.collection?.records || [],
        generatedAt: new Date().toISOString(),
    }

    // Save for future use
    await writeJSONFile(fixtureFile, fixture)
    console.log(`✓ ${item.name}: Fixture saved`)

    return fixture
}

async function main() {
    const catalog = await readJSONFile<
        Array<{
            name: string
            path: string
            exports: Array<{ name: string; hash: string }>
        }>
    >(catalogFile)

    // Ensure fixtures directory exists
    await mkdir(fixturesDir, { recursive: true })

    // Flatten all catalog exports
    const items: CatalogWorkItem[] = catalog.flatMap((record) =>
        record.exports.map((exp) => ({
            name: exp.name,
            path: record.path,
            hash: exp.hash,
        }))
    )

    console.log(`Generating ${items.length} fixtures...`)

    for (const item of items) {
        await loadOrGenerateFixture(item)
    }

    console.log('DONE')
}

main().catch(console.error)
