// MongoDB Driver v2.x implementation
// v2 uses callbacks, not promises
import { DSN } from '../dsn';
import { CatalogDriver, GenericDocument, QueryResult, normalizeError, normalizeDocuments } from './interface';

// Import mongodb2 without types
const mongodb2: any = require('mongodb2');
const { MongoClient } = mongodb2;

type Db = any;
type Collection = any;

function promisify<T>(fn: (callback: (err: any, result: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
        fn((err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

export async function createDriverV2(dsn: DSN): Promise<CatalogDriver> {
    let client: any;
    let db: Db;
    let collection: Collection | null = null;
    
    return {
        async connect(): Promise<void> {
            // v2 uses callback-based connect
            client = await promisify<Db>((cb) => {
                MongoClient.connect(dsn.url, cb);
            });
            db = client;
        },
        
        async disconnect(): Promise<void> {
            if (client && client.close) {
                client.close();
            }
        },
        
        async initCollection(options: {
            name: string;
            indices?: Array<{ [key: string]: 1 | -1 } | string>;
            documents?: GenericDocument[];
        }): Promise<void> {
            // Drop existing (v2 doesn't have dropCollection on db, need to use collection.drop)
            try {
                const existingCollection = db.collection(options.name);
                await promisify<void>((cb) => existingCollection.drop(cb));
            } catch {
                // Collection didn't exist, ignore
            }
            
            // Get collection (v2 creates implicitly)
            collection = db.collection(options.name);
            
            // Create indices
            if (options.indices?.length) {
                for (const index of options.indices) {
                    const indexSpec = typeof index === 'string' 
                        ? { [index]: 1 } 
                        : index;
                    await promisify<void>((cb) => collection!.createIndex(indexSpec, cb));
                }
            }
            
            // Insert documents
            if (options.documents?.length) {
                await promisify<any>((cb) => collection!.insertMany(options.documents!, cb));
            }
        },
        
        async dropCollection(name: string): Promise<void> {
            try {
                const coll = db.collection(name);
                await promisify<void>((cb) => coll.drop(cb));
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
                const docs = await promisify<GenericDocument[]>((cb) => {
                    collection!.find(query).toArray(cb);
                });
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
