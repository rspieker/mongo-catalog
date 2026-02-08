// MongoDB Driver v7.x implementation
import { MongoClient, Collection, Db } from 'mongodb7';
import { DSN } from '../dsn';
import { CatalogDriver, GenericDocument, QueryResult, normalizeError, normalizeDocuments } from './interface';

export async function createDriverV7(dsn: DSN): Promise<CatalogDriver> {
    const client = new MongoClient(dsn.url);
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
            indices?: Array<{ [key: string]: 1 | -1 } | string>;
            documents?: GenericDocument[];
        }): Promise<void> {
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
            
            // Insert documents
            if (options.documents?.length) {
                await collection.insertMany(options.documents);
            }
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
