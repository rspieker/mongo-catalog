/**
 * fingerprint.ts
 *
 * Reads test-cases.ndjson produced by a test extractor and emits
 * fingerprints.ndjson where each line is the structural fingerprint
 * of the query, ready for gap detection.
 *
 * Usage:
 *   npx ts-node scripts/fingerprint.ts <test-cases.ndjson> <fingerprints.ndjson>
 */

import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { fingerprintQuery } from '../source/domain/coverage/fingerprint'
import { checksum } from '../source/domain/serialization'

type TestCase = {
    source: string
    collection: string
    method: string
    filter: Array<Record<string, unknown>>
    context: Array<Record<string, unknown>>
    indices?: Array<Record<string, unknown>>
    assertion: { method: string; expected: unknown }
}

const FILTER_METHODS = new Set(['find', 'findOne', 'count', 'countDocuments'])

const [, , inputArg, outputArg] = process.argv
if (!inputArg || !outputArg) {
    console.error('Usage: ts-node scripts/fingerprint.ts <test-cases.ndjson> <fingerprints.ndjson>')
    process.exit(1)
}

const inputPath = resolve(inputArg)
const outputPath = resolve(outputArg)

async function main() {
    const out = createWriteStream(outputPath, 'utf-8')
    const rl = createInterface({
        input: createReadStream(inputPath, 'utf-8'),
        crlfDelay: Infinity,
    })

    let total = 0

    for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const testCase = JSON.parse(trimmed) as TestCase

        if (!FILTER_METHODS.has(testCase.method)) continue
        if (testCase.filter.length === 0) continue

        const query = testCase.filter[0]
        if (query === null || typeof query !== 'object' || Array.isArray(query)) continue
        const fp = fingerprintQuery(query)
        const cs = checksum(fp)

        out.write(JSON.stringify({
            source: testCase.source,
            query,
            context: testCase.context,
            indices: testCase.indices ?? [],
            fingerprint: fp,
            checksum: cs,
        }) + '\n')

        total++
    }

    await new Promise<void>((resolve, reject) => {
        out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })

    console.log(`Fingerprinted ${total} queries → ${outputPath}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
