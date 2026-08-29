// MongoDB Driver v4.x implementation
// v4 has stricter types and removed some deprecated methods
import { MongoClient, Db, Collection } from 'mongodb4';
import { DSN } from '../dsn';
import type { CatalogDriver, GenericDocument, QueryResult } from './interface'
import { normalizeDocuments, normalizeError, insertDocumentsSafely, isQueryTimeoutError, MAX_QUERY_TIME_MS } from './helpers'
import type { Bootstrap } from './interface'

export async function createDriverV4(dsn: DSN): Promise<CatalogDriver> {
    // Explicit, shorter-than-default timeouts: the driver's own default
    // serverSelectionTimeoutMS (30s) resolves *normally* inside execute()'s
    // try/catch when the server is unreachable (e.g. crashed mid-operation)
    // — it doesn't throw, so nothing external can race against it. Every
    // subsequent call independently re-discovers the outage at the same
    // cost, since the driver doesn't cache "server is down" between calls.
    const client = new MongoClient(dsn.url, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
    });
    let db: Db;
    let collection: Collection<GenericDocument> | null = null;
    
    return {
        async connect(): Promise<void> {
            await client.connect();
            db = client.db(dsn.name);
        },
        
        async disconnect(): Promise<void> {
            await client.close();
        },
        
        async initCollection(options: {
            name: string;
            indices?: Array<{ [key: string]: 1 | -1 | 'text' } | string>;
            documents?: GenericDocument[];
        }): Promise<Bootstrap> {
            // Drop existing
            try {
                await db.collection(options.name).drop();
            } catch {
                // Ignore
            }
            
            collection = db.collection(options.name);
            
            // Create indices
            if (options.indices?.length) {
                for (const index of options.indices) {
                    if (typeof index === 'string') {
                        await collection.createIndex({ [index]: 1 });
                    } else {
                        await collection.createIndex(index);
                    }
                }
            }
            
            return insertDocumentsSafely(options.documents ?? [], doc => collection!.insertOne(doc))
        },
        
        async dropCollection(name: string): Promise<void> {
            try {
                await db.collection(name).drop();
            } catch {
                // Ignore
            }
            collection = null;
        },
        
        async execute(query: object): Promise<QueryResult> {
            if (!collection) {
                return {
                    success: false,
                    error: { message: 'No collection initialized', type: 'Error' },
                };
            }
            
            try {
                const docs = await collection.find(query).maxTimeMS(MAX_QUERY_TIME_MS).toArray();
                return {
                    success: true,
                    documents: normalizeDocuments(docs),
                };
            } catch (error: any) {
                // A real MongoDB error (bad operand type, etc) is legitimate
                // data worth recording; a maxTimeMS timeout means we don't
                // know the real answer, and should abort the catalog rather
                // than be recorded as if it were one.
                if (isQueryTimeoutError(error)) throw error;
                return {
                    success: false,
                    error: normalizeError(error),
                };
            }
        },
    };
}
