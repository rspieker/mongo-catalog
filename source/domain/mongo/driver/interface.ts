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
        indices?: Array<{ [key: string]: 1 | -1 | 'text' } | string>;
        documents?: GenericDocument[];
    }): Promise<Bootstrap>;
    
    dropCollection(name: string): Promise<void>;
    
    // Query execution
    execute(query: object): Promise<QueryResult>;
}

