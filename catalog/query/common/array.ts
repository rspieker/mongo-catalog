import {
    compile,
    items,
    date,
    number,
    picker,
    several,
    range,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

const document = compile({
    name: picker('Alice', 'Bob', 'Charlie', 'Diana', 'Eve'),
    tags: several(
        'javascript',
        'nodejs',
        'mongodb',
        'typescript',
        'python',
        'security',
        'cryptography',
        'docker',
        'ui',
        'design',
        'machine-learning',
        'data-science',
        'frontend',
        'backend',
        'fullstack'
    ),
    permissions: range(1, 4, 'read', 'write', 'execute', 'admin'),
    scores: items({
        subject: picker('math', 'science', 'english', 'history'),
        score: number(60, 100),
    }),
    products: items({
        category: picker('electronics', 'books'),
        name: picker(
            'Laptop',
            'Smartphone',
            'Tablet',
            'Programming Guide',
            'Python Cookbook'
        ),
        price: number(20, 1500),
        inStock: picker(true, false),
    }),
    transactions: items({
        type: picker('purchase', 'refund'),
        amount: number(10, 1500),
        date: date('2023-01-01', '2023-12-31'),
    }),
    nested: {
        tags: range(
            1,
            2,
            'frontend',
            'backend',
            'fullstack',
            'data',
            'design',
            'ux'
        ),
    },
    emptyArray: () => [],
    mixedArray: () => [1, 'string', true, false, null, undefined, {}],
})

export type TestDocument = MongoDocument<ReturnType<typeof document>>

export const array: Catalog<TestDocument> = {
    operations: [
        // $all - Contains all elements
        { tags: { $all: ['javascript', 'nodejs'] } },
        { permissions: { $all: ['read', 'write'] } },
        { scores: { $all: [80, 90] } },

        // $all with nested arrays
        { 'nested.tags': { $all: ['frontend', 'backend'] } },

        // $elemMatch - Element matches all conditions
        {
            products: {
                $elemMatch: {
                    category: 'electronics',
                    price: { $gt: 500 },
                },
            },
        },
        {
            scores: {
                $elemMatch: {
                    subject: 'math',
                    score: { $gte: 85 },
                },
            },
        },
        {
            transactions: {
                $elemMatch: {
                    type: 'purchase',
                    amount: { $lt: 100 },
                    date: { $gte: new Date('2023-01-01') },
                },
            },
        },

        // $size - Array size
        { tags: { $size: 3 } },
        { permissions: { $size: 2 } },
        { scores: { $size: 4 } },
        { emptyArray: { $size: 0 } },

        // Complex combinations
        {
            $and: [
                { tags: { $all: ['javascript'] } },
                { tags: { $size: { $gte: 2 } } },
            ],
        },
        {
            $or: [
                { scores: { $elemMatch: { score: { $gte: 90 } } } },
                { permissions: { $all: ['admin'] } },
            ],
        },

        // Error cases
        { tags: { $all: 'javascript' } }, // String instead of array
        { permissions: { $elemMatch: 'invalid' } }, // Invalid condition
        { scores: { $size: -1 } }, // Negative size
        { scores: { $size: 3.5 } }, // Non-integer size
        { nonExistent: { $size: 0 } }, // Field doesn't exist
        { mixedArray: { $elemMatch: { score: { $gt: 'high' } } } }, // Type mismatch

        // Edge cases
        { tags: { $all: [] } }, // Empty array - should match all
        { tags: { $all: ['nonexistent'] } }, // Non-existent element
        { scores: { $elemMatch: {} } }, // Empty condition
        { scores: { $size: 100 } }, // Size larger than any actual array
    ],
    collection: {
        records: Array.from({ length: 20 }, (_, i) => document(i)),
    },
}
