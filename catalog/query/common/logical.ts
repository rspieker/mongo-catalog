import { Catalog } from '../../catalog'
import { type TestDocument, evaluation } from './evaluation'

export const logical: Catalog<TestDocument> = {
    operations: [
        // $and - All conditions must match
        { $and: [{ age: { $gte: 18 } }, { status: 'active' }] },
        {
            $and: [
                { 'profile.premium': true },
                { 'profile.rating': { $gte: 4.0 } },
            ],
        },
        {
            $and: [
                { tags: { $in: ['javascript', 'python'] } },
                { active: true },
            ],
        },

        // Nested $and
        {
            $and: [
                { age: { $gte: 25 } },
                { $and: [{ status: 'active' }, { active: true }] },
            ],
        },

        // $or - At least one condition must match
        { $or: [{ age: { $lt: 25 } }, { age: { $gt: 60 } }] },
        { $or: [{ status: 'pending' }, { status: 'suspended' }] },
        {
            $or: [
                { 'profile.premium': true },
                { 'profile.rating': { $gte: 4.5 } },
            ],
        },

        // $nor - No conditions should match
        { $nor: [{ status: 'deleted' }, { status: 'banned' }] },
        { $nor: [{ age: { $lt: 18 } }, { 'profile.rating': { $lt: 2.0 } }] },

        // $not - Negates the condition
        { $not: { status: 'deleted' } },
        { $not: { 'profile.premium': false } },
        { $not: { age: { $gt: 65 } } },

        // Complex nesting
        {
            $and: [
                { active: true },
                {
                    $or: [
                        {
                            $and: [
                                { age: { $lt: 25 } },
                                { 'profile.rating': { $gte: 4.0 } },
                            ],
                        },
                        {
                            $and: [
                                { age: { $gte: 25 } },
                                { 'profile.premium': true },
                            ],
                        },
                    ],
                },
                { $not: { status: 'suspended' } },
            ],
        },

        // Edge cases with empty arrays
        { $and: [] }, // Should match all documents
        { $or: [] }, // Should match no documents
        { $and: [{}] }, // Empty object matches all
        { $or: [{}] }, // Empty object matches all

        // Error cases
        { $and: [{ age: { $gt: 'thirty' } }] }, // Type mismatch
        { $or: [{ 'profile.rating': { $lt: 'low' } }] }, // String instead of number
        { $not: { invalid: { $eq: null } } }, // Invalid field
        { $and: null }, // Invalid input
        { $or: 'invalid' }, // Invalid input
    ],
    collection: evaluation.collection,
}
