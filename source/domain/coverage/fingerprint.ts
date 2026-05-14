export type FingerprintNode =
    | string
    | FingerprintNode[]
    | { [key: string]: FingerprintNode }

export type DocumentFingerprint = { [key: string]: FingerprintNode }
export type QueryFingerprint = { [key: string]: FingerprintNode }

export type Fingerprint = {
    document: DocumentFingerprint
    query: QueryFingerprint
}

export type StoreEntry = { kind: string; value: unknown; reference: string }

export function fingerprinter() {
    const store: StoreEntry[] = []

    function getType(input: unknown): string {
        if (input === null) return 'null'
        if (Array.isArray(input)) return 'array'
        if (input instanceof Date) return 'date'
        if (input instanceof RegExp) return 'regex'
        if (typeof input === 'string' && input.startsWith('$')) return 'operator'
        return typeof input
    }

    function ref(value: unknown, type: string = getType(value)): string {
        if (type === 'operator') return value as string

        const normalized =
            type === 'date' ? (value as Date).toISOString()
            : type === 'regex' ? String(value)
            : value

        const byType = store.filter(({ kind }) => kind === type)
        const found = byType.find(({ value: v }) => v === normalized)
        if (found) return found.reference

        const reference = `${type}:#${byType.length + 1}`
        store.push({ kind: type, value: normalized, reference })
        return reference
    }

    function fingerprint(value: unknown, inExpr = false): FingerprintNode {
        const type = getType(value)

        if (type === 'object') {
            return Object.fromEntries(
                Object.entries(value as object).map(([key, val]) => [
                    key.startsWith('$')
                        ? key
                        : key.split('.').map((k) => /^\d+$/.test(k) ? 'index' : ref(k, 'field')).join('.'),
                    fingerprint(val, inExpr || key === '$expr'),
                ])
            )
        }

        if (type === 'array') {
            return (value as unknown[]).map((item) => fingerprint(item, inExpr))
        }

        // $-prefixed strings as values have context-dependent meaning:
        // - inside $expr: single-$ is a field path reference, $$-prefix is a system variable
        // - outside $expr: literal string value, abstracted normally
        if (type === 'operator') {
            if (inExpr && !(value as string).startsWith('$$')) {
                return ref((value as string).slice(1), 'field')
            }
            return ref(value, 'string')
        }

        return ref(value, type)
    }

    return {
        process: (input: unknown): FingerprintNode => fingerprint(input),
        store: store as readonly StoreEntry[],
    }
}

export function fingerprintQuery(
    query: Record<string, unknown>
): QueryFingerprint {
    if (query === null || typeof query !== 'object' || Array.isArray(query)) return {}
    return fingerprinter().process(query) as QueryFingerprint
}

export function fingerprint(
    document: Record<string, unknown>,
    query: Record<string, unknown>
): Fingerprint {
    const fp = fingerprinter()
    return {
        document: fp.process(document) as DocumentFingerprint,
        query: fp.process(query) as QueryFingerprint,
    }
}
