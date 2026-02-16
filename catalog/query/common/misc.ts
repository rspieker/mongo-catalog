import {
    compile,
    number,
    picker,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents for error case testing
const document = compile({
    number: number(0, 100),
    string: picker('hello', 'world', '123'),
    bool: picker(true, false),
    color: picker('purple', 'red', 'blue', 'green'),
    price: number(1, 100),
    quantity: number(0, 50),
})

export type MiscDocument = MongoDocument<ReturnType<typeof document>>

export const misc: Catalog<MiscDocument> = {
    operations: [
        // Empty query - matches all
        {},

        // Invalid operators
        { $nop: false },
        { $invalid: true },
        { $unknown: 'value' },

        // $not with invalid types
        { color: { $not: 'purple' } },
        { color: { $not: 123 } },
        { color: { $not: true } },

        // $nor with invalid structure
        { $nor: { color: 'purple' } }, // Should be array
        { $nor: ['purple'] }, // Array of non-objects

        // $expr errors
        { $expr: { $eq: [{ $divide: ['$number', 0] }, 1] } }, // Division by zero
        { $expr: { $eq: [{ $divide: ['$string', 0] }, 1] } }, // String division
        { $expr: { $eq: [{ $divide: ['$string', 0.1] }, 1] } }, // String division
        { $expr: { $eq: [{ $divide: ['$bool', 0] }, 1] } }, // Boolean division
        { $expr: { $eq: [{ $divide: ['$bool', 0.1] }, 1] } }, // Boolean division
        { $expr: { $eq: [{ $divide: ['$unknown', 0] }, 1] } }, // Unknown field

        // Invalid field paths
        { 'invalid.path.that.does.not.exist': 'value' },
        { '': 'empty field name' },
        { '.': 'dot field name' },
        { '..': 'double dot field name' },

        // Type mismatches
        { number: { $gt: 'not a number' } },
        { string: { $gt: 123 } },
        { bool: { $in: ['true', 'false'] } },
        { price: { $in: ['cheap', 'expensive'] } },

        // Null and undefined
        { number: null },
        { string: undefined },
        { color: { $eq: null } },
        { price: { $ne: undefined } },

        // Invalid regex
        { string: { $regex: '[invalid' } }, // Unclosed bracket
        { string: { $regex: '(invalid' } }, // Unclosed paren
        { string: { $regex: 'pattern', $options: 'xyz' } }, // Invalid options
        { string: { $regex: 'pattern', $options: 'imxyz' } }, // Mix valid/invalid options

        // Invalid $mod
        { number: { $mod: [0, 0] } }, // Division by zero
        { number: { $mod: [2, 5] } }, // Remainder >= divisor
        { number: { $mod: 'invalid' } }, // Not an array
        { number: { $mod: [2] } }, // Missing remainder
        { number: { $mod: [] } }, // Empty array

        // Invalid array operators
        { color: { $all: 'not an array' } },
        { color: { $elemMatch: 'not an object' } },
        { color: { $size: 'not a number' } },
        { color: { $size: -1 } }, // Negative size
        { color: { $size: 1.5 } }, // Non-integer size

        // Invalid bitwise
        { number: { $bitsAllClear: -1 } },
        { number: { $bitsAllSet: -1 } },
        { number: { $bitsAnyClear: [-1] } },
        { number: { $bitsAnySet: [-1] } },

        // Deep nesting errors
        { color: { $not: { $not: { $not: 'purple' } } } },
        { price: { $gt: { $lt: 10 } } }, // Nested comparison

        // Mixed valid/invalid
        { number: { $gte: 0, $invalid: true } },
        { color: 'purple', $unknown: 'value' },

        // Very long field names (edge case)
        { ['a'.repeat(200)]: 'value' },

        // Special characters in field names
        { 'field\nwith\nnewlines': 'value' },
        { 'field\twith\ttabs': 'value' },
        { 'field\u0000with\u0000nulls': 'value' },
    ],
    collection: {
        records: Array.from({ length: 20 }, (_, i) => document(i)),
    },
}
