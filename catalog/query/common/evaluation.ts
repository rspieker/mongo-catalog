import {
    compile,
    date,
    number,
    picker,
    several,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

const document = compile({
    name: picker(
        'Alice',
        'Bob',
        'Charlie',
        'Diana',
        'Eve',
        'Frank',
        'Grace',
        'Henry',
        'Ivy'
    ),
    age: number(21, 65),
    active: picker(true, false),
    status: picker('active', 'inactive', 'pending', 'suspended', 'deleted'),
    profile: {
        rating: number(0, 5, 1),
        premium: picker(true, false),
        balance: number(0, 1e3, 2),
    },
    tags: several(
        'javascript',
        'nodejs',
        'mongodb',
        'typescript',
        'svelte',
        'security',
        'cryptography',
        'docker',
        'ui',
        'design',
        'linux',
        'sailfish',
        'html',
        'css'
    ),
    stats: {
        loginCount: number(5, 30),
        failedLogins: number(0, 10),
    },
    lastLogin: date('2023', '2026-02-04'),
    createdAt: date('2020', '2025'),
})
export type TestDocument = MongoDocument<ReturnType<typeof document>>

export const evaluation: Catalog<TestDocument> = {
    operations: [
        // $expr - Use aggregation expressions in query
        { $expr: { $gt: ['$age', 25] } },
        { $expr: { $eq: ['$name', 'Alice'] } },
        { $expr: { $gte: ['$profile.rating', 4.0] } },

        // Complex $expr with arithmetic
        { $expr: { $gt: [{ $multiply: ['$age', 2] }, 60] } },
        { $expr: { $eq: [{ $add: ['$profile.balance', 1000] }, 2500.75] } },

        // $expr with string operations
        { $expr: { $eq: [{ $toLower: ['$status'] }, 'active'] } },
        { $expr: { $gt: [{ $strLenCP: ['$name'] }, 4] } },

        // $expr with array operations
        { $expr: { $gt: [{ $size: ['$tags'] }, 2] } },
        { $expr: { $in: ['javascript', '$tags'] } },

        // $expr with date operations
        { $expr: { $gte: ['$lastLogin', new Date('2023-01-01')] } },
        { $expr: { $eq: [{ $year: ['$createdAt'] }, 2023] } },

        // $expr with conditional
        {
            $expr: {
                $cond: {
                    if: { $gte: ['$age', 18] },
                    then: 'adult',
                    else: 'minor',
                },
            },
        },

        // Nested $expr
        {
            $expr: {
                $and: [
                    { $gte: ['$age', 18] },
                    { $eq: ['$active', true] },
                    { $gt: [{ $size: ['$tags'] }, 1] },
                ],
            },
        },

        // Complex business logic
        {
            $expr: {
                $or: [
                    {
                        $and: [
                            { $eq: ['$profile.premium', true] },
                            { $gte: ['$profile.rating', 4.5] },
                        ],
                    },
                    {
                        $and: [
                            { $gte: ['$stats.loginCount', 50] },
                            { $lt: ['$stats.failedLogins', 5] },
                        ],
                    },
                ],
            },
        },

        // Error cases
        { $expr: { $gt: ['$age', 'twenty-five'] } }, // Type mismatch
        { $expr: { $eq: ['$nonExistent', 'value'] } }, // Non-existent field
        { $expr: { $add: ['$age', 'invalid'] } }, // Invalid operation
        { $expr: { $divide: ['$age', 0] } }, // Division by zero
        { $expr: { $multiply: [] } }, // Missing arguments
        { $expr: { $size: '$name' } }, // Size on non-array
        { $expr: { $year: '$age' } }, // Year on non-date

        // Edge cases
        { $expr: { $eq: [null, null] } },
        { $expr: { $gt: [null, 0] } },
        { $expr: { $size: [] } }, // Size of empty array in expression
        { $expr: { $add: [] } }, // Empty add
        { $expr: {} }, // Empty expression
    ],
    collection: {
        records: Array.from({ length: 20 }, (_, i) => document(i)),
    },
}
