/**
 * process-gaps.ts
 *
 * Reads gaps.ndjson and generates Catalog<T> TypeScript files in
 * catalog/query/coverage/ grouped by jstest source topic.
 *
 * For each topic:
 *   - Deduplicates operations by structural fingerprint
 *   - Infers a compile()-based document schema from jstest context documents
 *   - Assigns meaningful field names from categorized pools
 *   - Rewrites queries to use the assigned names
 *   - Adds type-variation and error-case operations
 *
 * Usage:
 *   npx ts-node scripts/process-gaps.ts <gaps.ndjson> [output-dir]
 *
 * output-dir defaults to ./catalog/query/coverage
 */

import { createReadStream } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve, join } from 'node:path'
import { checksum } from '../source/domain/serialization'
import { fieldNames } from '../source/domain/generator/resources/field-names'
import type { GapRecord } from '../source/domain/coverage/gap-detector'

const [, , inputArg, outputArg] = process.argv
if (!inputArg) {
    console.error('Usage: ts-node scripts/process-gaps.ts <gaps.ndjson> [output-dir]')
    process.exit(1)
}

const inputPath = resolve(inputArg)
const outputDir = resolve(outputArg ?? './catalog/query/coverage')

// ─── Schema inference ─────────────────────────────────────────────────────────

type FieldKind = 'number' | 'string' | 'boolean' | 'array-number' | 'array-string' | 'mixed'

type FieldSpec = {
    kind: FieldKind
    min?: number
    max?: number
    values?: string[]
    // whether this path is used as a *parent* (has dotted children) as well as a leaf
    hasChildren?: boolean
}

function updateSpec(existing: FieldSpec | undefined, value: unknown): FieldSpec {
    if (value === null || value === undefined) return existing ?? { kind: 'mixed' }

    if (Array.isArray(value)) {
        const kind: FieldKind = value.every((v) => typeof v === 'number')
            ? 'array-number'
            : value.every((v) => typeof v === 'string')
              ? 'array-string'
              : 'mixed'
        if (!existing || existing.kind === kind) return { ...existing, kind }
        return { ...existing, kind: 'mixed' }
    }

    if (typeof value === 'number') {
        if (!existing || existing.kind === 'number') {
            return {
                kind: 'number',
                min: Math.min(existing?.min ?? value, value),
                max: Math.max(existing?.max ?? value, value),
            }
        }
        return { kind: 'mixed' }
    }

    if (typeof value === 'string') {
        if (!existing || existing.kind === 'string') {
            const values = [...new Set([...(existing?.values ?? []), value])]
            return { kind: 'string', values }
        }
        return { kind: 'mixed' }
    }

    if (typeof value === 'boolean') {
        if (!existing || existing.kind === 'boolean') return { kind: 'boolean' }
        return { kind: 'mixed' }
    }

    return { kind: 'mixed' }
}

function inferSchema(records: GapRecord[]): Map<string, FieldSpec> {
    const schema = new Map<string, FieldSpec>()

    for (const record of records) {
        for (const doc of record.context) {
            collectFields(doc, '', schema)
        }
    }

    for (const record of records) {
        ensureQueryFields(record.query, schema)
    }

    // Mark paths that have children (conflict detection)
    for (const path of schema.keys()) {
        const parent = path.includes('.') ? path.split('.').slice(0, -1).join('.') : null
        if (parent && schema.has(parent)) {
            const existing = schema.get(parent)!
            schema.set(parent, { ...existing, hasChildren: true })
        }
    }

    return schema
}

function collectFields(
    doc: Record<string, unknown>,
    prefix: string,
    schema: Map<string, FieldSpec>,
): void {
    for (const [key, value] of Object.entries(doc)) {
        if (key === '_id') continue
        const path = prefix ? `${prefix}.${key}` : key

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            collectFields(value as Record<string, unknown>, path, schema)
        } else {
            schema.set(path, updateSpec(schema.get(path), value))
        }
    }
}

function ensureQueryFields(query: unknown, schema: Map<string, FieldSpec>): void {
    if (typeof query !== 'object' || query === null) return
    if (Array.isArray(query)) { query.forEach((v) => ensureQueryFields(v, schema)); return }

    for (const [key, val] of Object.entries(query as Record<string, unknown>)) {
        if (key.startsWith('$')) {
            ensureQueryFields(val, schema)
        } else {
            if (!schema.has(key)) schema.set(key, { kind: 'number', min: 0, max: 100 })
        }
    }
}

// ─── Field name assignment ────────────────────────────────────────────────────

type NamePool = keyof typeof fieldNames

function poolForKind(kind: FieldKind): NamePool {
    switch (kind) {
        case 'number': return 'integer'
        case 'string': return 'category'
        case 'boolean': return 'flag'
        case 'array-number': return 'numericArray'
        case 'array-string': return 'stringArray'
        default: return 'integer'
    }
}

// Returns a map from original path → new path.
// Conflicting paths (used as both leaf and parent of dotted paths) get
// separate names: one for the leaf usage, one as a parent prefix.
function assignNames(schema: Map<string, FieldSpec>): Map<string, string> {
    const counters = new Map<NamePool, number>()
    const nameMap = new Map<string, string>()

    function nextName(pool: NamePool): string {
        const idx = counters.get(pool) ?? 0
        counters.set(pool, idx + 1)
        const list = fieldNames[pool] as readonly string[]
        return list[idx % list.length]
    }

    // Process root segments first, then build dotted paths from them
    const segmentNames = new Map<string, string>() // original segment → assigned name

    function nameForSegment(seg: string, kind: FieldKind): string {
        if (!segmentNames.has(seg)) {
            segmentNames.set(seg, nextName(poolForKind(kind)))
        }
        return segmentNames.get(seg)!
    }

    for (const [path, spec] of schema) {
        const parts = path.split('.')

        // When a path is both a leaf and a parent (conflict), generate an
        // extra dedicated name for its leaf usage (the parent gets its own
        // name used only as a struct prefix).
        if (spec.hasChildren && !path.includes('.')) {
            // This path is a parent: name it, but separately name it as a leaf too
            const parentName = nameForSegment(path, spec.kind)
            // leaf variant gets an independent name
            const leafName = nextName(poolForKind(spec.kind))
            nameMap.set(`${path}:leaf`, leafName)
            nameMap.set(path, parentName)
        } else {
            const mapped = parts.map((seg, i) => {
                const partial = parts.slice(0, i + 1).join('.')
                const partSpec = schema.get(partial) ?? spec
                return nameForSegment(seg, partSpec.kind)
            })
            nameMap.set(path, mapped.join('.'))
        }
    }

    return nameMap
}

// ─── Query rewriting ──────────────────────────────────────────────────────────

// Rewrite all field path keys in a query using the name map.
function rewriteQuery(
    query: Record<string, unknown>,
    nameMap: Map<string, string>,
    schema: Map<string, FieldSpec>
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(query).map(([key, val]) => {
            if (key.startsWith('$')) return [key, rewriteValue(val, nameMap, schema)]

            // Check if this key has a leaf-conflict variant
            const newKey = schema.get(key)?.hasChildren
                ? (nameMap.get(`${key}:leaf`) ?? nameMap.get(key) ?? key)
                : (nameMap.get(key) ?? key)

            return [newKey, rewriteValue(val, nameMap, schema)]
        })
    )
}

function rewriteValue(
    val: unknown,
    nameMap: Map<string, string>,
    schema: Map<string, FieldSpec>
): unknown {
    if (typeof val !== 'object' || val === null) return val
    if (Array.isArray(val)) return val.map((v) => rewriteValue(v, nameMap, schema))
    return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [
            k.startsWith('$') ? k : (nameMap.get(k) ?? k),
            rewriteValue(v, nameMap, schema),
        ])
    )
}

// ─── Code generation ──────────────────────────────────────────────────────────

function specToGenerator(spec: FieldSpec, used: Set<string>): string {
    switch (spec.kind) {
        case 'number': {
            used.add('number')
            const lo = Math.floor(Math.min(spec.min ?? 0, 0))
            const hi = Math.ceil(Math.max(spec.max ?? 100, lo + 10))
            return `number(${lo}, ${hi})`
        }
        case 'string': {
            used.add('picker')
            const vals = (spec.values ?? ['a', 'b', 'c']).slice(0, 8)
            return `picker(${vals.map((v) => JSON.stringify(v)).join(', ')})`
        }
        case 'boolean': {
            used.add('picker')
            return `picker(true, false)`
        }
        case 'array-number': {
            used.add('several')
            return `several(0, 1, 2, 3, 4, 5, 10, 20, 50, 100)`
        }
        case 'array-string': {
            used.add('several')
            return `several('a', 'b', 'c', 'x', 'y', 'z')`
        }
        default: {
            used.add('number')
            return `number(0, 100)`
        }
    }
}

// Build nested compile() struct using new names. Leaf paths that also had
// a :leaf variant are added as top-level fields using their leaf name.
function buildStruct(
    schema: Map<string, FieldSpec>,
    nameMap: Map<string, string>,
    used: Set<string>
): Record<string, unknown> {
    const struct: Record<string, unknown> = {}

    for (const [path, spec] of schema) {
        // Leaf-conflict: add separate top-level field with leaf name
        if (spec.hasChildren && nameMap.has(`${path}:leaf`)) {
            const leafName = nameMap.get(`${path}:leaf`)!
            struct[leafName] = specToGenerator(spec, used)
        }

        // Skip intermediate paths (those that have children → handled by nesting)
        const hasChildren = [...schema.keys()].some((k) => k.startsWith(`${path}.`))
        if (hasChildren) continue

        const newPath = nameMap.get(path) ?? path
        const parts = newPath.split('.')
        let node = struct
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) {
                node[parts[i]] = {}
            }
            node = node[parts[i]] as Record<string, unknown>
        }
        node[parts[parts.length - 1]] = specToGenerator(spec, used)
    }

    return struct
}

function structToTS(struct: Record<string, unknown>, indent: number): string {
    const pad = '    '.repeat(indent)
    const inner = '    '.repeat(indent + 1)
    const lines = Object.entries(struct).map(([k, v]) =>
        typeof v === 'string'
            ? `${inner}${k}: ${v}`
            : `${inner}${k}: ${structToTS(v as Record<string, unknown>, indent + 1)}`
    )
    return `{\n${lines.join(',\n')},\n${pad}}`
}

function tsKey(k: string): string {
    return /^[$a-zA-Z_][$\w]*$/.test(k) ? k : `'${k.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function toTSValue(v: unknown): string {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) {
        if (v.length === 0) return '[]'
        return `[${v.map(toTSValue).join(', ')}]`
    }
    const entries = Object.entries(v as object)
    if (entries.length === 0) return '{}'
    return `{ ${entries.map(([k, val]) => `${tsKey(k)}: ${toTSValue(val)}`).join(', ')} }`
}

// ─── Type variations ──────────────────────────────────────────────────────────

// Substitute every leaf value of a given JS type in the query with a
// replacement, producing a type-variant operation.
function substituteLeafType(
    v: unknown,
    fromType: string,
    toValue: unknown
): [changed: boolean, result: unknown] {
    if (v === null) {
        return fromType === 'null' ? [true, toValue] : [false, v]
    }
    if (typeof v !== 'object') {
        return typeof v === fromType ? [true, toValue] : [false, v]
    }
    if (Array.isArray(v)) {
        const results = v.map((item) => substituteLeafType(item, fromType, toValue))
        if (results.some(([c]) => c)) return [true, results.map(([, r]) => r)]
        return [false, v]
    }
    // Plain object: recurse into values (skip operator keys to preserve structure)
    const entries = Object.entries(v as Record<string, unknown>).map(([k, val]) => {
        const [c, r] = substituteLeafType(val, fromType, toValue)
        return [k, c, r] as const
    })
    if (entries.some(([, c]) => c)) {
        return [true, Object.fromEntries(entries.map(([k, , r]) => [k, r]))]
    }
    return [false, v]
}

type TypeVariant = { label: string; fromType: string; toValue: unknown }

const TYPE_VARIATIONS: TypeVariant[] = [
    { label: 'null value',    fromType: 'number',  toValue: null },
    { label: 'string value',  fromType: 'number',  toValue: 'value' },
    { label: 'boolean value', fromType: 'number',  toValue: true },
    { label: 'null value',    fromType: 'string',  toValue: null },
    { label: 'number value',  fromType: 'string',  toValue: 42 },
    { label: 'boolean value', fromType: 'string',  toValue: true },
    { label: 'null value',    fromType: 'boolean', toValue: null },
    { label: 'number value',  fromType: 'boolean', toValue: 0 },
    { label: 'string value',  fromType: 'boolean', toValue: 'yes' },
]

// Operators that validate their argument shape — substitute the whole
// operator value rather than individual leaf types
const OPERATOR_ERROR_CASES: Record<string, Array<{ label: string; value: unknown }>> = {
    $mod:        [{ label: 'string operand', value: 'invalid' }, { label: 'missing remainder', value: [2] }, { label: 'empty array', value: [] }],
    $in:         [{ label: 'string instead of array', value: 'active' }],
    $nin:        [{ label: 'string instead of array', value: 'deleted' }],
    $all:        [{ label: 'string instead of array', value: 'value' }, { label: 'number instead of array', value: 42 }],
    $size:       [{ label: 'string size', value: 'large' }, { label: 'float size', value: 2.5 }],
    $elemMatch:  [{ label: 'non-object operand', value: 42 }],
    $bitsAllSet:   [{ label: 'string bitmask', value: 'invalid' }],
    $bitsAnyClear: [{ label: 'string bitmask', value: 'invalid' }],
    $bitsAnySet:   [{ label: 'string bitmask', value: 'invalid' }],
    $bitsAllClear: [{ label: 'string bitmask', value: 'invalid' }],
}

function substituteOperator(
    query: unknown, op: string, replacement: unknown
): [changed: boolean, result: unknown] {
    if (typeof query !== 'object' || query === null) return [false, query]
    if (Array.isArray(query)) {
        const results = query.map((v) => substituteOperator(v, op, replacement))
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

function generateVariants(
    operations: Record<string, unknown>[]
): Array<{ label: string; query: Record<string, unknown> }> {
    const seen = new Set<string>()
    const originalKeys = new Set(operations.map((op) => checksum(op)))
    const variants: Array<{ label: string; query: Record<string, unknown> }> = []

    function add(label: string, query: Record<string, unknown>) {
        const key = checksum(query)
        if (!seen.has(key) && !originalKeys.has(key)) {
            seen.add(key)
            variants.push({ label, query })
        }
    }

    for (const op of operations) {
        // Operator-level error cases
        for (const operator of [...new Set(collectOperators(op))]) {
            for (const { label, value } of OPERATOR_ERROR_CASES[operator] ?? []) {
                const [changed, result] = substituteOperator(op, operator, value)
                if (changed) add(label, result as Record<string, unknown>)
            }
        }

        // Type substitutions on leaf values
        for (const { label, fromType, toValue } of TYPE_VARIATIONS) {
            const [changed, result] = substituteLeafType(op, fromType, toValue)
            if (changed) add(label, result as Record<string, unknown>)
        }
    }

    return variants
}

// ─── File generation ──────────────────────────────────────────────────────────

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
    return s.split(/[^a-zA-Z0-9]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

const KNOWN_GENERATORS = ['number', 'picker', 'several', 'date']

function generateFile(
    topic: string,
    schema: Map<string, FieldSpec>,
    nameMap: Map<string, string>,
    operations: Record<string, unknown>[],
    variants: Array<{ label: string; query: Record<string, unknown> }>
): string {
    const used = new Set<string>(['compile'])
    const struct = buildStruct(schema, nameMap, used)
    const structTS = structToTS(struct, 0)
    const importList = ['compile', ...KNOWN_GENERATORS.filter((g) => used.has(g))].join(', ')
    const typeName = `${toPascalCase(topic)}Document`
    const exportName = toIdentifier(topic)
    const recordCount = Math.max(20, Math.ceil(operations.length * 1.5))

    const opsLines = operations.map((op) => `        ${toTSValue(op)},`).join('\n')
    const variantLines = variants.length > 0
        ? '\n        // type and error variants\n' + variants.map(({ query }) => `        ${toTSValue(query)},`).join('\n')
        : ''

    return `import { ${importList} } from '../../../source/domain/generator/compiler'
import type { Catalog, MongoDocument } from '../../catalog'

const document = compile(${structTS})

export type ${typeName} = MongoDocument<ReturnType<typeof document>>

export const ${exportName}: Catalog<${typeName}> = {
    operations: [
${opsLines}${variantLines}
    ],
    collection: {
        records: Array.from({ length: ${recordCount} }, (_, i) => document(i)),
    },
}
`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function topicFromSource(source: string): string {
    const parts = source.split('/')
    return parts[parts.length - 2] ?? parts[parts.length - 1]?.replace(/\.js$/, '') ?? 'unknown'
}

async function main() {
    const allGaps: GapRecord[] = []
    const rl = createInterface({
        input: createReadStream(inputPath, 'utf-8'),
        crlfDelay: Infinity,
    })
    for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const record = JSON.parse(trimmed) as GapRecord
        if (record.status === 'gap') allGaps.push(record)
    }

    const groups = new Map<string, GapRecord[]>()
    for (const gap of allGaps) {
        const topic = topicFromSource(gap.source)
        if (!groups.has(topic)) groups.set(topic, [])
        groups.get(topic)!.push(gap)
    }

    await mkdir(outputDir, { recursive: true })

    let filesWritten = 0
    let totalOps = 0

    for (const [topic, records] of groups) {
        // Deduplicate by structural fingerprint
        const seen = new Set<string>()
        const unique = records.filter(({ checksum: cs }) => {
            if (seen.has(cs)) return false
            seen.add(cs)
            return true
        })

        const schema = inferSchema(unique)
        const nameMap = assignNames(schema)
        const operations = unique.map((r) => rewriteQuery(r.query, nameMap, schema))
        const variants = generateVariants(operations)

        const code = generateFile(topic, schema, nameMap, operations, variants)
        await writeFile(join(outputDir, `${topic}.ts`), code, 'utf-8')

        filesWritten++
        totalOps += operations.length + variants.length
        console.log(`  ${topic}.ts  (${operations.length} ops + ${variants.length} variants)`)
    }

    console.log(`\nWrote ${filesWritten} files, ${totalOps} total operations → ${outputDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
