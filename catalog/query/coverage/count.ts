import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Catalog, MongoDocument } from '../../catalog'

type CoverageData = {
    queries: Array<{ checksum: string; fingerprint: unknown; query: Record<string, unknown> }>
    variants: Record<string, unknown>[]
    documents: Record<string, unknown>[]
}

const data: CoverageData = JSON.parse(
    readFileSync(join(__dirname, '../../../automation/coverage/count.json'), 'utf-8')
)

export type CountDocument = MongoDocument<Record<string, unknown>>

export const count: Catalog<CountDocument> = {
    operations: [
        ...data.queries.map(q => q.query),
        ...data.variants,
    ],
    collection: {
        records: data.documents,
    },
}
