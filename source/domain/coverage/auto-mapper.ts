import { checksum } from '../serialization'
import { fingerprintQuery, type QueryFingerprint } from './fingerprint'
import { computeSignature, type BehavioralSignature } from './behavioral-signature'
import type { CatalogEntry } from './catalog-runner'
import type { CatalogDriver, GenericDocument } from '../mongo/driver/interface'

export type MappedEntry = {
    sourceQuery: Record<string, unknown>
    adaptedQuery: Record<string, unknown>
    catalogPath: string
    signature: BehavioralSignature
}

export type MapResult =
    | { kind: 'mapped'; entry: MappedEntry }
    | { kind: 'mismatch'; reason: string }
    | { kind: 'no-match' }

export async function tryAutoMap(
    query: Record<string, unknown>,
    targetFingerprint: QueryFingerprint,
    catalogEntries: CatalogEntry[],
    driver: CatalogDriver
): Promise<MapResult> {
    const targetChecksum = checksum(targetFingerprint)

    for (const entry of catalogEntries) {
        for (const operation of entry.catalog.operations) {
            const op = operation as Record<string, unknown>
            if (checksum(fingerprintQuery(op)) !== targetChecksum) continue

            const fieldMap = buildFieldMap(op, query)
            if (!fieldMap) continue

            const adapted = remapQuery(query, fieldMap)
            const documents = entry.catalog.collection.records as GenericDocument[]

            const originalSig = await computeSignature(op, documents, driver)
            const adaptedSig = await computeSignature(adapted, documents, driver)

            if (!signaturesMatch(originalSig, adaptedSig)) {
                return {
                    kind: 'mismatch',
                    reason: `cardinality ${originalSig.cardinality} → ${adaptedSig.cardinality}`,
                }
            }

            return {
                kind: 'mapped',
                entry: {
                    sourceQuery: query,
                    adaptedQuery: adapted,
                    catalogPath: entry.path,
                    signature: adaptedSig,
                },
            }
        }
    }

    return { kind: 'no-match' }
}

function signaturesMatch(a: BehavioralSignature, b: BehavioralSignature): boolean {
    return a.cardinality === b.cardinality && a.errorCode === b.errorCode
}

function buildFieldMap(
    source: Record<string, unknown>,
    target: Record<string, unknown>
): Map<string, string> | null {
    const sourceFields = extractFields(source)
    const targetFields = extractFields(target)
    if (sourceFields.length !== targetFields.length) return null

    const map = new Map<string, string>()
    for (let i = 0; i < sourceFields.length; i++) {
        map.set(targetFields[i], sourceFields[i])
    }
    return map
}

function extractFields(query: Record<string, unknown>): string[] {
    const fields: string[] = []
    function walk(v: unknown) {
        if (typeof v !== 'object' || v === null) return
        if (Array.isArray(v)) { v.forEach(walk); return }
        for (const [k, val] of Object.entries(v)) {
            if (!k.startsWith('$')) fields.push(k)
            walk(val)
        }
    }
    walk(query)
    return fields
}

function remapQuery(
    query: Record<string, unknown>,
    fieldMap: Map<string, string>
): Record<string, unknown> {
    function remap(v: unknown): unknown {
        if (typeof v !== 'object' || v === null) return v
        if (Array.isArray(v)) return v.map(remap)
        return Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([k, val]) => [
                k.startsWith('$') ? k : (fieldMap.get(k) ?? k),
                remap(val),
            ])
        )
    }
    return remap(query) as Record<string, unknown>
}
