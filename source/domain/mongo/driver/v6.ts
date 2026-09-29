// MongoDB Driver v6.x implementation
import { MongoClient, Collection, Db } from 'mongodb6';
import { DSN } from '../dsn';
import type { CatalogDriver, GenericDocument, QueryResult } from './interface'
import { normalizeDocuments, normalizeError, insertDocumentsSafely, isQueryTimeoutError, MAX_QUERY_TIME_MS, resolveIndexSpec } from './helpers'
import type { Bootstrap, IndexSpec } from './interface'

export async function createDriverV6(dsn: DSN): Promise<CatalogDriver> {
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
            indices?: Array<IndexSpec>;
            documents?: GenericDocument[];
        }): Promise<Bootstrap> {
            // Drop existing
            try {
                await db.collection(options.name).drop();
            } catch {
                // Collection didn't exist, ignore
            }
            
            // Create new collection
            collection = db.collection(options.name);
            
            // Create indices
            if (options.indices?.length) {
                for (const index of options.indices) {
                    const { keys, options: indexOptions } = resolveIndexSpec(index);
                    await collection.createIndex(keys, indexOptions);
                }
            }
            
            return insertDocumentsSafely(options.documents ?? [], doc => collection!.insertOne(doc))
        },
        
        async dropCollection(name: string): Promise<void> {
            try {
                await db.collection(name).drop();
            } catch {
                // Ignore if doesn't exist
            }
            collection = null;
        },
        
        async execute(query: object): Promise<QueryResult> {
            if (!collection) {
                return {
                    success: false,
                    error: {
                        message: 'No collection initialized',
                        type: 'Error',
                    },
                };
            }
            
            try {
                const docs = await collection.find(query).maxTimeMS(MAX_QUERY_TIME_MS).toArray();
                return {
                    success: true,
                    documents: normalizeDocuments(docs),
                };
            } catch (error: any) {
                if (isQueryTimeoutError(error)) throw error;
                return {
                    success: false,
                    error: normalizeError(error),
                };
            }
        },
    };
}
