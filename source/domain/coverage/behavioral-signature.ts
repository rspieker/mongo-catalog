import type { CatalogDriver, GenericDocument } from '../mongo/driver/interface'

export type Cardinality = 'all' | 'some' | 'none' | 'error'
export type FieldShape = 'scalar' | 'array' | 'nested' | 'missing'

export type BehavioralSignature = {
    cardinality: Cardinality
    errorCode?: string | number
    fieldShape: FieldShape
}

const TEMP_COLLECTION = 'coverage_analysis'

export async function computeSignature(
    query: Record<string, unknown>,
    documents: GenericDocument[],
    driver: CatalogDriver
): Promise<BehavioralSignature> {
    const fieldShape = resolveFieldShape(query, documents)

    await driver.initCollection({ name: TEMP_COLLECTION, documents })
    const result = await driver.execute(query)
    await driver.dropCollection(TEMP_COLLECTION)

    if (!result.success) {
        return {
            cardinality: 'error',
            errorCode: result.error?.code ?? result.error?.message,
            fieldShape,
        }
    }

    const matched = result.documents?.length ?? 0
    const total = documents.length
    const cardinality: Cardinality =
        matched === 0 ? 'none' : matched === total ? 'all' : 'some'

    return { cardinality, fieldShape }
}

function resolveFieldShape(
    query: Record<string, unknown>,
    documents: GenericDocument[]
): FieldShape {
    const field = firstQueryField(query)
    if (!field || documents.length === 0) return 'missing'

    const value = getNestedValue(documents[0], field)
    if (value === undefined) return 'missing'
    if (Array.isArray(value)) return 'array'
    if (value !== null && typeof value === 'object') return 'nested'
    return 'scalar'
}

function firstQueryField(query: Record<string, unknown>): string | undefined {
    for (const key of Object.keys(query)) {
        if (!key.startsWith('$')) return key
    }
    return undefined
}

function getNestedValue(doc: GenericDocument, path: string): unknown {
    return path.split('.').reduce<unknown>((obj, key) => {
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
            return (obj as Record<string, unknown>)[key]
        }
        return undefined
    }, doc)
}
