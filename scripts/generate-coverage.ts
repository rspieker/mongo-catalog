/**
 * generate-coverage.ts
 *
 * Reads gaps.ndjson and generates automation/coverage/<topic>.json files.
 *
 * Records are first grouped by type-aware document structure. Groups that
 * share the same value-collapsed structure (same shape, different scalar
 * types) are then merged — this handles $or-style tests where the same
 * field holds mixed types across documents. The nudge for each group is
 * derived from the first record's checksum.
 *
 * Usage:
 *   npx ts-node scripts/generate-coverage.ts <gaps.ndjson> [output-dir]
 *
 * output-dir defaults to ./automation/coverage
 */

import { createReadStream } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve, join } from 'node:path'
import { fingerprinter } from '../source/domain/coverage/fingerprint'
import type { FingerprintNode, StoreEntry } from '../source/domain/coverage/fingerprint'
import { fieldNames } from '../source/domain/generator/resources/field-names'
import { adjectives as adjectiveGroups } from '../source/domain/generator/resources/data'
import type { GapRecord } from '../source/domain/coverage/gap-detector'

// ─── Setup ────────────────────────────────────────────────────────────────────

type NamePool = keyof typeof fieldNames

const flatAdjectives: string[] = (adjectiveGroups as string[][]).flat()

// ─── Utilities ────────────────────────────────────────────────────────────────

function topicFromSource(source: string): string {
    const parts = source.split('/')
    return parts[parts.length - 2] ?? parts[parts.length - 1]?.replace(/\.js$/, '') ?? 'unknown'
}

function nudgeFor(checksum: string): number {
    return (parseInt(checksum.slice(0, 4), 16) % 37) + 1
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

// Two normalizers sharing the same structure walk — only leaf handling differs.
// collapseValues=false: keeps type names (number:, string:) for precise grouping
// collapseValues=true:  collapses all scalar refs to 'value' for coarse grouping
function makeNormalizer(collapseValues: boolean) {
    function normalize(node: FingerprintNode): FingerprintNode {
        if (typeof node === 'string') {
            if (node.startsWith('field:')) return node.replace(/:#\d+/g, '')
            if (node.includes(':#')) return collapseValues ? 'value' : node.replace(/:#\d+/g, '')
            return node
        }
        if (Array.isArray(node)) {
            const seen = new Set<string>()
            return node.map(normalize).filter(item => {
                const k = JSON.stringify(item)
                return seen.has(k) ? false : (seen.add(k), true)
            })
        }
        return Object.fromEntries(
            Object.entries(node).map(([k, v]) => [k.replace(/:#\d+/g, ''), normalize(v)])
        )
    }
    return normalize
}

const normalizeTyped = makeNormalizer(false)
const normalizeCollapsed = makeNormalizer(true)

function contextKey(context: Record<string, unknown>[], normalizer: (n: FingerprintNode) => FingerprintNode): string {
    const fp = fingerprinter()
    const shapes = new Set<string>()
    for (const doc of context) {
        shapes.add(JSON.stringify(normalizer(fp.process(doc))))
    }
    return JSON.stringify([...shapes].sort())
}

// ─── Field type detection ─────────────────────────────────────────────────────

// Scans all document fingerprints for the type stored under fieldRef.
// Falls back to 'label' (neutral) when multiple incompatible types are found.
function poolFor(fieldRef: string, docFps: FingerprintNode[]): NamePool {
    let detected: NamePool | null = null

    for (const fp of docFps) {
        if (typeof fp !== 'object' || fp === null || Array.isArray(fp)) continue
        const val = (fp as Record<string, FingerprintNode>)[fieldRef]
        if (val === undefined) continue

        let pool: NamePool
        if (Array.isArray(val)) {
            const first = val[0]
            pool = (typeof first === 'string' && first.startsWith('string:'))
                ? 'stringArray'
                : 'numericArray'
        } else if (typeof val === 'string') {
            if (val.startsWith('number:')) pool = 'integer'
            else if (val.startsWith('string:')) pool = 'category'
            else if (val.startsWith('boolean:')) pool = 'flag'
            else if (val.startsWith('date:')) pool = 'date'
            else continue
        } else continue

        if (detected === null) detected = pool
        else if (detected !== pool) return 'label'
    }

    return detected ?? 'integer'
}

// ─── Slot assignment ──────────────────────────────────────────────────────────

type SlotMap = Map<string, unknown>

function buildSlots(
    store: readonly StoreEntry[],
    docFps: FingerprintNode[],
    nudge: number,
    fieldCounters: Map<NamePool, number>
): SlotMap {
    const slots: SlotMap = new Map()

    for (const { kind, value, reference } of store) {
        switch (kind) {
            case 'field': {
                const pool = poolFor(reference, docFps)
                const idx = fieldCounters.get(pool) ?? 0
                fieldCounters.set(pool, idx + 1)
                const list = fieldNames[pool] as readonly string[]
                slots.set(reference, list[idx % list.length])
                break
            }
            case 'number':
                slots.set(reference, (value as number) + nudge)
                break
            case 'string': {
                const n = parseInt(reference.split(':#')[1], 10) - 1
                slots.set(reference, flatAdjectives[n % flatAdjectives.length])
                break
            }
            default:
                slots.set(reference, value)
        }
    }

    return slots
}

// ─── Variant generation ───────────────────────────────────────────────────────

function substituteLeafType(
    v: unknown,
    fromType: string,
    toValue: unknown
): [changed: boolean, result: unknown] {
    if (v === null) return fromType === 'null' ? [true, toValue] : [false, v]
    if (typeof v !== 'object') return typeof v === fromType ? [true, toValue] : [false, v]
    if (Array.isArray(v)) {
        const results = v.map(item => substituteLeafType(item, fromType, toValue))
        if (results.some(([c]) => c)) return [true, results.map(([, r]) => r)]
        return [false, v]
    }
    const entries = Object.entries(v as Record<string, unknown>).map(([k, val]) => {
        const [c, r] = substituteLeafType(val, fromType, toValue)
        return [k, c, r] as const
    })
    if (entries.some(([, c]) => c)) return [true, Object.fromEntries(entries.map(([k, , r]) => [k, r]))]
    return [false, v]
}

function substituteOperator(
    query: unknown, op: string, replacement: unknown
): [changed: boolean, result: unknown] {
    if (typeof query !== 'object' || query === null) return [false, query]
    if (Array.isArray(query)) {
        const results = query.map(v => substituteOperator(v, op, replacement))
        if (results.some(([c]) => c)) return [true, results.map(([, r]) => r)]
        return [false, query]
    }
    const obj = query as Record<string, unknown>
    if (op in obj) return [true, { ...obj, [op]: replacement }]
    const entries = Object.entries(obj).map(([k, v]) => {
        const [c, r] = substituteOperator(v, op, replacement)
        return [k, c, r] as const
    })
    if (entries.some(([, c]) => c)) return [true, Object.fromEntries(entries.map(([k, , r]) => [k, r]))]
    return [false, query]
}

function collectOperators(v: unknown): string[] {
    if (typeof v !== 'object' || v === null) return []
    if (Array.isArray(v)) return v.flatMap(collectOperators)
    const ops: string[] = []
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k.startsWith('$')) ops.push(k)
        ops.push(...collectOperators(val))
    }
    return ops
}

const TYPE_VARIATIONS = [
    { fromType: 'number',  toValue: null },
    { fromType: 'number',  toValue: 'value' },
    { fromType: 'number',  toValue: true },
    { fromType: 'string',  toValue: null },
    { fromType: 'string',  toValue: 42 },
    { fromType: 'string',  toValue: true },
    { fromType: 'boolean', toValue: null },
    { fromType: 'boolean', toValue: 0 },
    { fromType: 'boolean', toValue: 'yes' },
]

const OPERATOR_ERROR_CASES: Record<string, Array<{ value: unknown }>> = {
    $mod:          [{ value: 'invalid' }, { value: [2] }, { value: [] }],
    $in:           [{ value: 'active' }],
    $nin:          [{ value: 'deleted' }],
    $all:          [{ value: 'value' }, { value: 42 }],
    $size:         [{ value: 'large' }, { value: 2.5 }],
    $elemMatch:    [{ value: 42 }],
    $bitsAllSet:   [{ value: 'invalid' }],
    $bitsAnyClear: [{ value: 'invalid' }],
    $bitsAnySet:   [{ value: 'invalid' }],
    $bitsAllClear: [{ value: 'invalid' }],
}

function generateVariants(
    queries: Record<string, unknown>[]
): Record<string, unknown>[] {
    const seen = new Set(queries.map(q => JSON.stringify(q)))
    const variants: Record<string, unknown>[] = []

    function add(query: Record<string, unknown>) {
        const key = JSON.stringify(query)
        if (seen.has(key)) return
        seen.add(key)
        variants.push(query)
    }

    for (const query of queries) {
        for (const op of [...new Set(collectOperators(query))]) {
            for (const { value } of OPERATOR_ERROR_CASES[op] ?? []) {
                const [changed, result] = substituteOperator(query, op, value)
                if (changed) add(result as Record<string, unknown>)
            }
        }
        for (const { fromType, toValue } of TYPE_VARIATIONS) {
            const [changed, result] = substituteLeafType(query, fromType, toValue)
            if (changed) add(result as Record<string, unknown>)
        }
    }

    return variants
}

// ─── Index reconstruction ─────────────────────────────────────────────────────

// Renames index key fields using the slot map while preserving values (index
// type descriptors like "2dsphere", 1, -1 must not be substituted).
function reconstructIndexKeys(
    index: Record<string, unknown>,
    store: readonly StoreEntry[],
    slots: SlotMap
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(index).map(([key, value]) => {
            if (key.startsWith('$')) return [key, value]
            const entry = (store as StoreEntry[]).find(e => e.kind === 'field' && e.value === key)
            if (entry) {
                const slotValue = slots.get(entry.reference)
                return [slotValue !== undefined ? String(slotValue) : key, value]
            }
            return [key, value]
        })
    )
}

// ─── Reconstruction ───────────────────────────────────────────────────────────

function reconstructKey(key: string, slots: SlotMap): string {
    if (key.startsWith('$')) return key
    return key.split('.').map(segment => {
        if (segment === 'index') return '0'
        const v = slots.get(segment)
        return v !== undefined ? String(v) : segment
    }).join('.')
}

function reconstruct(node: FingerprintNode, slots: SlotMap): unknown {
    if (typeof node === 'string') {
        if (!slots.has(node)) return node
        // field: refs appearing as values are $expr field path references — restore the $
        return node.startsWith('field:') ? `$${slots.get(node)}` : slots.get(node)
    }
    if (Array.isArray(node)) return node.map(n => reconstruct(n, slots))
    return Object.fromEntries(
        Object.entries(node).map(([key, val]) => [
            reconstructKey(key, slots),
            reconstruct(val, slots),
        ])
    )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CoverageQuery = {
    checksum: string
    fingerprint: FingerprintNode
    query: Record<string, unknown>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [, , inputArg, outputArg] = process.argv
if (!inputArg) {
    console.error('Usage: ts-node scripts/generate-coverage.ts <gaps.ndjson> [output-dir]')
    process.exit(1)
}

const inputPath = resolve(inputArg)
const outputDir = resolve(outputArg ?? './automation/coverage')

async function main() {
    const allGaps: GapRecord[] = []
    const rl = createInterface({ input: createReadStream(inputPath, 'utf-8'), crlfDelay: Infinity })
    for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const record = JSON.parse(trimmed) as GapRecord
        if (record.status === 'gap') allGaps.push(record)
    }

    const topics = new Map<string, GapRecord[]>()
    for (const gap of allGaps) {
        const topic = topicFromSource(gap.source)
        if (!topics.has(topic)) topics.set(topic, [])
        topics.get(topic)!.push(gap)
    }

    await mkdir(outputDir, { recursive: true })

    let filesWritten = 0

    for (const [topic, records] of topics) {
        // Deduplicate by checksum
        const seen = new Set<string>()
        const unique = records.filter(r => {
            if (seen.has(r.checksum)) return false
            seen.add(r.checksum)
            return true
        })

        // First pass: group by type-aware document structure
        const typedGroups = new Map<string, { records: GapRecord[], collapsedKey: string }>()
        for (const record of unique) {
            const tKey = contextKey(record.context, normalizeTyped)
            const cKey = contextKey(record.context, normalizeCollapsed)
            if (!typedGroups.has(tKey)) typedGroups.set(tKey, { records: [], collapsedKey: cKey })
            typedGroups.get(tKey)!.records.push(record)
        }

        // Second pass: merge typed groups that share the same collapsed key
        const collapsedIndex = new Map<string, string[]>()
        for (const [tKey, { collapsedKey }] of typedGroups) {
            if (!collapsedIndex.has(collapsedKey)) collapsedIndex.set(collapsedKey, [])
            collapsedIndex.get(collapsedKey)!.push(tKey)
        }

        const finalGroups: GapRecord[][] = []
        for (const tKeys of collapsedIndex.values()) {
            const merged: GapRecord[] = []
            for (const tKey of tKeys) merged.push(...typedGroups.get(tKey)!.records)
            finalGroups.push(merged)
        }

        // Field name counters are per-topic so names don't repeat across groups
        const fieldCounters = new Map<NamePool, number>()
        const queries: CoverageQuery[] = []
        const documents: Record<string, unknown>[] = []
        const allReconstructedQueries: Record<string, unknown>[] = []
        const seenIndices = new Set<string>()
        const indices: Record<string, unknown>[] = []

        for (const groupRecords of finalGroups) {
            const fp = fingerprinter()
            const nudge = nudgeFor(groupRecords[0].checksum)

            // Process all context documents first to build the shared pool,
            // deduplicating by fingerprint within the group
            const docFps: FingerprintNode[] = []
            const seenDocFps = new Set<string>()

            for (const record of groupRecords) {
                for (const doc of record.context) {
                    const docFp = fp.process(doc)
                    const key = JSON.stringify(normalizeTyped(docFp))
                    if (seenDocFps.has(key)) continue
                    seenDocFps.add(key)
                    docFps.push(docFp)
                }
            }

            // Process all queries through the same shared fingerprinter
            const queryFps = groupRecords.map(record => ({
                record,
                fp: fp.process(record.query),
            }))

            const slots = buildSlots(fp.store, docFps, nudge, fieldCounters)

            for (const { record, fp: queryFp } of queryFps) {
                const query = reconstruct(queryFp, slots) as Record<string, unknown>
                queries.push({ checksum: record.checksum, fingerprint: record.fingerprint, query })
                allReconstructedQueries.push(query)
            }

            for (const docFp of docFps) {
                const doc = reconstruct(docFp, slots) as Record<string, unknown>
                documents.push({ _id: documents.length, ...doc })
            }

            // Collect indices, renaming field keys via slot map (values like "2dsphere" are preserved)
            for (const record of groupRecords) {
                for (const idx of (record.indices ?? [])) {
                    const reconstructed = reconstructIndexKeys(idx as Record<string, unknown>, fp.store, slots)
                    const key = JSON.stringify(reconstructed)
                    if (seenIndices.has(key)) continue
                    seenIndices.add(key)
                    indices.push(reconstructed)
                }
            }
        }

        const variants = generateVariants(allReconstructedQueries)

        await writeFile(
            join(outputDir, `${topic}.json`),
            JSON.stringify({ queries, variants, documents, indices }, null, 2),
            'utf-8'
        )
        filesWritten++
        console.log(`  ${topic}.json  (${queries.length} queries, ${variants.length} variants, ${documents.length} documents, ${indices.length} indices)`)
    }

    console.log(`\nWrote ${filesWritten} files → ${outputDir}`)
}

main().catch(err => { console.error(err); process.exit(1) })
