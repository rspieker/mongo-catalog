// MongoDB Driver v7.x implementation
import { MongoClient, Collection, Db } from 'mongodb7';
import { DSN } from '../dsn';
import type { CatalogDriver, GenericDocument, QueryResult } from './interface'
import { normalizeDocuments, normalizeError, insertDocumentsSafely, isQueryTimeoutError, MAX_QUERY_TIME_MS } from './helpers'
import type { Bootstrap } from './interface'

export async function createDriverV7(dsn: DSN): Promise<CatalogDriver> {
    const client = new MongoClient(dsn.url, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
    });
    let db: Db;
    let collection: Collection<GenericDocument> | null = null;
    
    return {
        async connect(): Promise<void> {
            console.log(`[Driver v7] Connecting to: ${dsn.url}`)
            console.log(`[Driver v7] Database: ${dsn.name}`)
            const startTime = Date.now()
            
            await client.connect();
            const elapsed = Date.now() - startTime
            console.log(`[Driver v7] Connected successfully in ${elapsed}ms`)
            
            db = client.db(dsn.name);
            
            // Verify connection
            const adminDb = client.db('admin')
            const buildInfo = await adminDb.command({ buildInfo: 1 })
            console.log(`[Driver v7] MongoDB version: ${buildInfo.version}`)
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
                // Collection didn't exist, ignore
            }
            
            // Create new collection
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
