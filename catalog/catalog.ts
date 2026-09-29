type KeyPath<T> = T extends object
    ? {
          [K in keyof T]: K extends string
              ? T[K] extends object
                  ? `${K}` | `${K}.${KeyPath<T[K]>}`
                  : `${K}`
              : never
      }[keyof T]
    : never

export type MongoDocument<T extends Record<string, unknown>> = T
export type MongoQuery<T extends MongoDocument<Record<string, unknown>>> = {
    [key in KeyPath<T>]?: unknown
} & {
    // Allow MongoDB query operators (using `unknown` to permit error cases)
    $expr?: unknown
    $and?: unknown
    $or?: unknown
    $nor?: unknown
    $not?: unknown
    $text?: unknown
    // Add other operators as needed
    [key: string]: unknown
}
// '$**' is MongoDB's real wildcard index syntax (e.g. for a wildcard text
// index) — not a real KeyPath<T> member, added explicitly so it's
// intentionally recognized rather than slipping through by accident (see
// the note above IndexKeySpec).
type IndexKeyPath<T> = KeyPath<T> | '$**'
type IndexKeySpec<T> = Partial<{ [K in IndexKeyPath<T>]: -1 | 0 | 1 | 'text' | '2dsphere' | '2d' }>

export type MongoCollection<T extends MongoDocument<Record<string, unknown>>> =
    {
        indices?: Array<
            | IndexKeySpec<T>
            | IndexKeyPath<T>
            // real createIndex options (e.g. textIndexVersion) alongside the key spec —
            // needed whenever the option itself is the thing under test, not just the keys
            | { keys: IndexKeySpec<T>; options: Record<string, unknown> }
        >
        records: Array<MongoDocument<T>>
    }

export type Catalog<T extends MongoDocument<Record<string, unknown>>> = {
    description?: string
    category?: string
    operations: Array<MongoQuery<T>>
    collection: MongoCollection<T>
}

export type CoverageData = {
    queries: Array<{ checksum: string; fingerprint: unknown; query: Record<string, unknown> }>
    variants: Record<string, unknown>[]
    documents: Record<string, unknown>[]
    indices?: Array<Record<string, -1 | 0 | 1 | 'text' | '2dsphere' | '2d'>>
}
