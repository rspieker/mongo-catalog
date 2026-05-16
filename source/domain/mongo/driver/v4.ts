// MongoDB Driver v4.x implementation
// v4 has stricter types and removed some deprecated methods
import { MongoClient, Db, Collection } from 'mongodb4';
import { DSN } from '../dsn';
import type { CatalogDriver, GenericDocument, QueryResult } from './interface'
import { normalizeDocuments, normalizeError, insertDocumentsSafely } from './helpers'
import type { Bootstrap } from './interface'

export async function createDriverV4(dsn: DSN): Promise<CatalogDriver> {
    const client = new MongoClient(dsn.url);
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
                const docs = await collection.find(query).toArray();
                return {
                    success: true,
                    documents: normalizeDocuments(docs),
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: normalizeError(error),
                };
            }
        },
    };
}
