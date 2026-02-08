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
}
export type MongoCollection<T extends MongoDocument<Record<string, unknown>>> =
    {
        indices?: Partial<{ [K in KeyPath<T>]: -1 | 0 | 1 }>
        records: Array<MongoDocument<T>>
    }

export type Catalog<T extends MongoDocument<Record<string, unknown>>> = {
    description?: string
    category?: string
    operations: Array<MongoQuery<T>>
    collection: MongoCollection<T>
}
