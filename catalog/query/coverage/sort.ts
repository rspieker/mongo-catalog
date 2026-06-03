import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Catalog, CoverageData, MongoDocument } from '../../catalog'

const data: CoverageData = JSON.parse(
    readFileSync(join(__dirname, '../../../automation/coverage/sort.json'), 'utf-8')
)

export type SortDocument = MongoDocument<Record<string, unknown>>

export const coverage_sort: Catalog<SortDocument> = {
    operations: [
        ...data.queries.map(q => q.query),
        ...data.variants,
    ],
    collection: {
        records: data.documents,
        ...(data.indices ? { indices: data.indices } : {}),
    },
}
