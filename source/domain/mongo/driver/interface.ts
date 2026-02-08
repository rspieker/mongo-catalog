// Unified MongoDB driver interface
// Works across driver versions 2.x through 6.x (and prepares for 7.x)

import { DSN } from '../dsn';

export type GenericDocument = {
    [key: string]: unknown;
    _id?: number;
    index?: number;
};

export type QueryResult = {
    success: boolean;
    documents?: number[];
    error?: {
        message: string;
        code?: string | number;
        type?: string;
    };
};

export interface CatalogDriver {
    // Lifecycle
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    
    // Collection management (per catalog task)
    initCollection(options: {
        name: string;
        indices?: Array<{ [key: string]: 1 | -1 } | string>;
        documents?: GenericDocument[];
    }): Promise<void>;
    
    dropCollection(name: string): Promise<void>;
    
    // Query execution
    execute(query: object): Promise<QueryResult>;
}

// Error normalization helper
export function normalizeError(error: any): QueryResult['error'] {
    if (!error) return undefined;
    
    // MongoDB driver errors have different shapes across versions
    return {
        message: error.message || error.errmsg || String(error),
        code: error.code || error.codeName,
        type: error.name || error.constructor?.name,
    };
}

// Document normalization helper
export function normalizeDocuments(docs: GenericDocument[]): number[] {
    return docs.map((doc) => doc._id as number);
}
