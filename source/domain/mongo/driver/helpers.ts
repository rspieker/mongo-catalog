import type { GenericDocument, QueryError, Bootstrap, InsertionProblem } from './interface'

// Bounds a single query's server-side execution time. Unlike
// connectTimeoutMS/serverSelectionTimeoutMS (which only matter when the
// server is unreachable), this catches the case where the connection is
// perfectly healthy but a specific query's plan search is pathologically
// slow or unbounded (confirmed real: a $or+index query took ~21 minutes on
// one run and was still running after 2+ hours on another, on otherwise
// identical, healthy infrastructure). MongoDB's own default is no limit at
// all. Real queries in this project's catalogs run in single-digit
// milliseconds, so this is generous, not tight.
export const MAX_QUERY_TIME_MS = 30_000;

// MaxTimeMSExpired is MongoDB's own server-side error code (50) for a query
// that hit maxTimeMS — stable across the whole MongoDB version range this
// project targets. Distinguishing it matters: unlike a real query error
// (bad operand type, etc — legitimate data worth recording), this means "we
// don't know what the real answer is," and should abort the in-progress
// catalog rather than be recorded as if it were a query result.
export function isQueryTimeoutError(error: any): boolean {
    return error?.code === 50 || error?.codeName === 'MaxTimeMSExpired';
}

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
