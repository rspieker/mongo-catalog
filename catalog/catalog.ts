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
export type MongoCollection<T extends MongoDocument<Record<string, unknown>>> =
    {
        indices?: Array<
            | { [K in KeyPath<T>]: -1 | 0 | 1 | 'text' | '2dsphere' | '2d' }
            | KeyPath<T>
        >
        records: Array<MongoDocument<T>>
    }

export type Catalog<T extends MongoDocument<Record<string, unknown>>> = {
    description?: string
    category?: string
    operations: Array<MongoQuery<T>>
    collection: MongoCollection<T>
}
