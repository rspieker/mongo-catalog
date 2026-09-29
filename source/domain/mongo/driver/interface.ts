// Unified MongoDB driver interface
// Works across driver versions 2.x through 6.x (and prepares for 7.x)

export type GenericDocument = {
    [key: string]: unknown;
    _id?: number;
    index?: number;
};

export type QueryError = {
    message: string;
    code?: string | number;
    type?: string;
};

export type QueryResult = {
    success: boolean;
    documents?: number[];
    error?: QueryError;
};

export type InsertionProblem = {
    error: QueryError;
    documents: number[];
};

export type IndexKeys = { [key: string]: 1 | -1 | 'text' };

// A bare key-spec or field name creates an index with no extra options
// (the common case). The `{ keys, options }` form exists for cases that
// need real createIndex options — e.g. `{ textIndexVersion: 1 }` to pin a
// legacy text index format for behavioral-difference testing, since
// mongo-catalog's whole point is surfacing exactly those differences.
export type IndexSpec = IndexKeys | string | { keys: IndexKeys; options: Record<string, unknown> };

export type Bootstrap = {
    problems: InsertionProblem[];
};

export interface CatalogDriver {
    // Lifecycle
    connect(): Promise<void>;
    disconnect(): Promise<void>;

    // Collection management (per catalog task)
    initCollection(options: {
        name: string;
        indices?: Array<IndexSpec>;
        documents?: GenericDocument[];
    }): Promise<Bootstrap>;
    
    dropCollection(name: string): Promise<void>;
    
    // Query execution
    execute(query: object): Promise<QueryResult>;
}

