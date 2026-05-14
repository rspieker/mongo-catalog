/**
 * scaffold-coverage.ts
 *
 * Generates catalog/query/coverage/<topic>.ts scaffold files from the JSON
 * files in automation/coverage/. Each scaffold imports its JSON at runtime
 * and wires queries, variants, and documents into the Catalog shape.
 *
 * Safe to re-run: existing files are skipped unless --force is passed.
 *
 * Usage:
 *   npx ts-node scripts/scaffold-coverage.ts [--force] [coverage-dir] [output-dir]
 *
 * coverage-dir defaults to ./automation/coverage
 * output-dir   defaults to ./catalog/query/coverage
 */

import { readdir, writeFile, access } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'

const args = process.argv.slice(2)
const force = args.includes('--force')
const rest = args.filter(a => a !== '--force')
const [coverageArg, outputArg] = rest

const coverageDir = resolve(coverageArg ?? './automation/coverage')
const outputDir = resolve(outputArg ?? './catalog/query/coverage')

// ─── Identifier helpers ───────────────────────────────────────────────────────

const RESERVED = new Set([
    'break','case','catch','class','const','continue','debugger','default',
    'delete','do','else','export','extends','finally','for','function','if',
    'import','in','instanceof','let','new','of','return','static','super',
    'switch','this','throw','try','typeof','var','void','while','with','yield',
])

function toIdentifier(s: string): string {
    const id = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1')
    return RESERVED.has(id) ? `${id}_` : id
}

function toPascalCase(s: string): string {
    return s.split(/[^a-zA-Z0-9]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

// ─── Scaffold template ────────────────────────────────────────────────────────

function scaffold(topic: string, exportName: string, typeName: string): string {
    return `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Catalog, MongoDocument } from '../../catalog'

type CoverageData = {
    queries: Array<{ checksum: string; fingerprint: unknown; query: Record<string, unknown> }>
    variants: Record<string, unknown>[]
    documents: Record<string, unknown>[]
}

const data: CoverageData = JSON.parse(
    readFileSync(join(__dirname, '../../../automation/coverage/${topic}.json'), 'utf-8')
)

export type ${typeName} = MongoDocument<Record<string, unknown>>

export const ${exportName}: Catalog<${typeName}> = {
    operations: [
        ...data.queries.map(q => q.query),
        ...data.variants,
    ],
    collection: {
        records: data.documents,
    },
}
`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
    return access(path).then(() => true).catch(() => false)
}

async function main() {
    const files = (await readdir(coverageDir)).filter(f => f.endsWith('.json'))

    let written = 0
    let skipped = 0

    for (const file of files) {
        const topic = basename(file, '.json')
        const exportName = toIdentifier(topic)
        const typeName = `${toPascalCase(topic)}Document`
        const outPath = join(outputDir, `${topic}.ts`)

        if (!force && await exists(outPath)) {
            skipped++
            continue
        }

        await writeFile(outPath, scaffold(topic, exportName, typeName), 'utf-8')
        written++
        console.log(`  ${topic}.ts`)
    }

    console.log(`\nWrote ${written} files, skipped ${skipped} → ${outputDir}`)
    if (skipped > 0) console.log('  (pass --force to overwrite existing files)')
}

main().catch(err => { console.error(err); process.exit(1) })
