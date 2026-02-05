import { Catalog } from '../../catalog'
import { TestDocument, evaluation } from './evaluation'

export const element: Catalog<TestDocument> = {
    operations: [
        // $exists - Field exists
        { name: { $exists: true } },
        { age: { $exists: true } },
        { middleName: { $exists: false } },
        { 'profile.premium': { $exists: true } },
        { 'profile.nonexistent': { $exists: false } },

        // $exists with null values
        { age: { $exists: true, $eq: null } },
        { middleName: { $exists: false } },

        // $type - Field type checking
        { name: { $type: 'string' } },
        { age: { $type: 'number' } },
        { active: { $type: 'bool' } },
        { tags: { $type: 'array' } },
        { profile: { $type: 'object' } },
        { lastLogin: { $type: 'date' } },
        { createdAt: { $type: 'date' } },

        // $type with numeric codes (BSON types)
        { name: { $type: 2 } }, // string
        { age: { $type: 16 } }, // 32-bit int or 1 for double
        { active: { $type: 8 } }, // bool
        { tags: { $type: 4 } }, // array
        { profile: { $type: 3 } }, // object
        { lastLogin: { $type: 9 } }, // date
        { _id: { $type: 7 } }, // ObjectId

        // $type with multiple possible types
        { age: { $type: ['number', 'null'] } },
        { status: { $type: ['string', 'null'] } },

        // Complex combinations
        {
            $and: [
                { name: { $exists: true, $type: 'string' } },
                { age: { $exists: true, $type: 'number' } },
                { middleName: { $exists: false } },
            ],
        },
        {
            $or: [
                { 'profile.premium': { $type: 'bool', $eq: true } },
                { 'profile.rating': { $type: 'number', $gte: 4.5 } },
            ],
        },

        // Nested field type checking
        { 'profile.balance': { $type: 'number' } },
        { 'stats.loginCount': { $type: 'number' } },
        { 'stats.failedLogins': { $type: 'number' } },
        { 'nested.deep.value': { $type: 'string' } },

        // Array element type checking
        { 'tags.0': { $type: 'string' } },
        { 'scores.0.score': { $type: 'number' } },
        { 'scores.0.subject': { $type: 'string' } },

        // Error cases
        { name: { $type: 'invalid_type' } }, // Invalid type name
        { age: { $type: 999 } }, // Invalid type code
        { 'profile.nonexistent': { $type: 'string' } }, // Non-existent field
        { name: { $exists: 'invalid' } }, // Invalid boolean value
        { age: { $type: null } }, // Null type
        { tags: { $type: 'string' } }, // Type mismatch

        // Edge cases
        { _id: { $type: 'objectId' } },
        { _id: { $type: 7 } },
        { age: { $type: 'long' } }, // Should not match regular numbers
        { 'profile.rating': { $type: 'int' } }, // Should match if it's an integer
        { 'profile.balance': { $type: 'decimal' } }, // Should match if it's decimal
    ],
    collection: evaluation.collection,
}
