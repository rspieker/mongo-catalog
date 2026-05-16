import type { GenericDocument, QueryError, Bootstrap, InsertionProblem } from './interface'

export function normalizeError(error: any): QueryError {
    if (!error) return { message: String(error) }
    return {
        message: error.message || error.errmsg || String(error),
        code: error.code || error.codeName,
        type: error.name || error.constructor?.name,
    }
}

export function normalizeDocuments(docs: GenericDocument[]): number[] {
    return docs.map((doc) => doc._id as number)
}

export function buildBootstrap(failures: Array<{ _id: number; error: QueryError }>): Bootstrap {
    const byError = new Map<string, InsertionProblem>()
    for (const { _id, error } of failures) {
        const key = JSON.stringify(error)
        if (!byError.has(key)) byError.set(key, { error, documents: [] })
        byError.get(key)!.documents.push(_id)
    }
    return { problems: [...byError.values()] }
}

export async function insertDocumentsSafely(
    documents: GenericDocument[],
    insertOne: (doc: GenericDocument) => Promise<unknown>
): Promise<Bootstrap> {
    const failures: Array<{ _id: number; error: QueryError }> = []
    for (const doc of documents) {
        try {
            await insertOne(doc)
        } catch (err: any) {
            failures.push({ _id: doc._id as number, error: normalizeError(err) })
        }
    }
    return buildBootstrap(failures)
}
