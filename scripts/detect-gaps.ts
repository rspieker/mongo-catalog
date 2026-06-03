/**
 * detect-gaps.ts
 *
 * Compares fingerprints.ndjson against the existing catalog and emits
 * gaps.ndjson where each line is a fingerprint record annotated with
 * its coverage status ('covered' | 'gap').
 *
 * Usage:
 *   npx ts-node scripts/detect-gaps.ts <fingerprints.ndjson> <gaps.ndjson> [catalog-root]
 *
 * catalog-root defaults to ./catalog/query
 */

import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { detectGaps } from '../source/domain/coverage/gap-detector'

const [, , inputArg, outputArg, catalogArg] = process.argv
if (!inputArg || !outputArg) {
    console.error('Usage: ts-node scripts/detect-gaps.ts <fingerprints.ndjson> <gaps.ndjson> [catalog-root]')
    process.exit(1)
}

const inputPath = resolve(inputArg)
const outputPath = resolve(outputArg)
const catalogRoot = resolve(catalogArg ?? './catalog/query/coverage')

async function main() {
    const out = createWriteStream(outputPath, 'utf-8')

    let covered = 0
    let gaps = 0

    for await (const record of detectGaps(inputPath, catalogRoot)) {
        out.write(JSON.stringify(record) + '\n')
        if (record.status === 'covered') covered++
        else gaps++
    }

    await new Promise<void>((resolve, reject) => {
        out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })

    console.log(`covered: ${covered}  gaps: ${gaps}  → ${outputPath}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
