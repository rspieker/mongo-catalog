import { Catalog } from '../../catalog'
import { type TestDocument, evaluation } from './evaluation'

export const comparison: Catalog<TestDocument> = {
    operations: [
        // $eq - Basic equality
        { name: { $eq: 'Alice' } },
        { age: { $eq: 30 } },
        { active: { $eq: true } },
        { 'profile.rating': { $eq: 4.5 } },
        { tags: { $eq: ['javascript', 'nodejs'] } },

        // $ne - Not equal
        { status: { $ne: 'deleted' } },
        { age: { $ne: 25 } },
        { 'profile.premium': { $ne: true } },

        // $gt - Greater than
        { age: { $gt: 25 } },
        { 'profile.rating': { $gt: 4.0 } },
        { 'stats.loginCount': { $gt: 10 } },

        // $gte - Greater than or equal
        { age: { $gte: 18 } },
        { 'profile.rating': { $gte: 3.5 } },

        // $lt - Less than
        { age: { $lt: 65 } },
        { 'profile.balance': { $lt: 1000 } },

        // $lte - Less than or equal
        { age: { $lte: 65 } },
        { 'stats.failedLogins': { $lte: 3 } },

        // $in - In array
        { status: { $in: ['active', 'pending'] } },
        { age: { $in: [25, 30, 35] } },
        { tags: { $in: ['javascript', 'typescript', 'python'] } },

        // $nin - Not in array
        { status: { $nin: ['deleted', 'banned'] } },
        { role: { $nin: ['guest', 'temp'] } },

        // Error cases - invalid types
        { age: { $eq: 'thirty' } }, // Type mismatch
        { 'profile.rating': { $gt: 'high' } }, // String instead of number
        { status: { $in: 'active' } }, // String instead of array
        { age: { $lt: null } }, // Null comparison
        { invalid: { $eq: undefined } }, // Undefined comparison
    ],
    collection: evaluation.collection,
}
