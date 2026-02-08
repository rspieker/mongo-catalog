import { join, resolve, relative, basename } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { glob } from 'glob'
import { hash } from '@konfirm/checksum'

type ExportRecord = {
    name: string // export name (e.g., "comparison")
    type: string // type of export
    hash: string // hash of the exported value
}

type QueryFileRecord = {
    name: string
    path: string
    exports: ExportRecord[]
    update: Array<{
        type: 'INITIAL' | 'UPDATE'
        date: string
        exportName?: string // which specific export changed
        before?: string
    }>
}

async function importAndInspect(filePath: string): Promise<ExportRecord[]> {
    try {
        // Import the module (requires tsx or ts-node)
        const module = await import(filePath)
        const exports: ExportRecord[] = []

        for (const [exportName, exportValue] of Object.entries(module)) {
            // Skip default and __esModule
            if (exportName === 'default' || exportName === '__esModule')
                continue

            // Check if it's a Catalog-like object
            if (exportValue && typeof exportValue === 'object') {
                const hasOperations = 'operations' in exportValue
                const hasCollection = 'collection' in exportValue

                if (hasOperations || hasCollection) {
                    exports.push({
                        name: exportName,
                        type: hasOperations ? 'Catalog' : 'Unknown',
                        hash: hash(exportValue, 'sha256', 'hex'),
                    })
                }
            }
        }

        return exports
    } catch (error) {
        console.error(`Failed to import ${filePath}:`, error)
        return []
    }
}

// Main execution
const automation = resolve(__dirname, '..', 'automation')
const catalog = resolve(__dirname, '..', 'catalog')
const catalogQueryFile = resolve(automation, 'catalog-queries.json')

// Read existing records
async function readExistingRecords(): Promise<Array<QueryFileRecord>> {
    try {
        const data = await readFile(catalogQueryFile, 'utf-8')
        const parsed = JSON.parse(data)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

async function main() {
    const files = await glob(join(catalog, '**', '*.ts'))
    const existingRecords = await readExistingRecords()
    const newRecords: Array<QueryFileRecord> = []

    for (const file of files) {
        const name = basename(file, '.ts')
        const path = relative(process.cwd(), file)
        const existing = existingRecords.find((r) => r.path === path)

        const currentExports = await importAndInspect(file)
        const record: QueryFileRecord = {
            name,
            path,
            exports: currentExports,
            update: existing ? [...existing.update] : [],
        }

        // Check each export for changes
        for (const currentExport of currentExports) {
            const previousExport = existing?.exports.find(
                (e) => e.name === currentExport.name
            )

            if (!previousExport) {
                // New export
                record.update.push({
                    type: 'INITIAL',
                    date: new Date().toISOString(),
                    exportName: currentExport.name,
                })
            } else if (previousExport.hash !== currentExport.hash) {
                // Export changed
                record.update.push({
                    type: 'UPDATE',
                    date: new Date().toISOString(),
                    exportName: currentExport.name,
                    before: previousExport.hash,
                })
            }
        }

        // Check for removed exports
        if (existing?.exports) {
            for (const oldExport of existing.exports) {
                if (!currentExports.find((e) => e.name === oldExport.name)) {
                    record.update.push({
                        type: 'UPDATE',
                        date: new Date().toISOString(),
                        exportName: `${oldExport.name} (removed)`,
                    })
                }
            }
        }

        newRecords.push(record)
    }

    const recordsWithData = newRecords.filter(
        ({ exports, update }) => exports.length || update.length
    )
    await writeFile(
        catalogQueryFile,
        JSON.stringify(recordsWithData, null, '\t')
    )
}

main()
    .then(() => console.log('DONE'))
    .catch(console.error)
