import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { checksum } from '../serialization'
import { fingerprintQuery, type QueryFingerprint } from './fingerprint'
import { loadCatalogs } from './catalog-runner'

export type GapStatus = 'covered' | 'gap'

export type FingerprintRecord = {
    source: string
    query: Record<string, unknown>
    context: Array<Record<string, unknown>>
    indices: Array<Record<string, unknown>>
    fingerprint: QueryFingerprint
    checksum: string
}

export type GapRecord = FingerprintRecord & {
    status: GapStatus
}

export async function buildCatalogIndex(
    catalogRoot: string
): Promise<Map<string, QueryFingerprint>> {
    const entries = await loadCatalogs(catalogRoot)
    const index = new Map<string, QueryFingerprint>()

    for (const { catalog } of entries) {
        const indexSig = (catalog.collection.indices ?? [])
            .map(idx => {
                const spec = typeof idx === 'string'
                    ? { [idx]: 1 } as Record<string, unknown>
                    : idx as Record<string, unknown>
                return checksum(fingerprintQuery(spec))
            })
            .sort()

        for (const operation of catalog.operations) {
            const fp = fingerprintQuery(operation as Record<string, unknown>)
            index.set(checksum({ query: fp, indices: indexSig }), fp)
        }
    }

    return index
}

export async function* readFingerprintRecords(
    ndjsonPath: string
): AsyncGenerator<FingerprintRecord> {
    const rl = createInterface({
        input: createReadStream(ndjsonPath, 'utf-8'),
        crlfDelay: Infinity,
    })
    for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue
        yield JSON.parse(trimmed) as FingerprintRecord
    }
}

export async function* detectGaps(
    fingerprintsPath: string,
    catalogRoot: string
): AsyncGenerator<GapRecord> {
    const index = await buildCatalogIndex(catalogRoot)

    for await (const record of readFingerprintRecords(fingerprintsPath)) {
        const covered = index.has(record.checksum)
        yield { ...record, status: covered ? 'covered' : 'gap' }
    }
}
