import {
    compile,
    number,
    picker,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with numeric values for expression testing
const document = compile({
    a: number(-100, 100), // Integer values for arithmetic
    b: number(-50, 50),
    c: number(1, 10), // Small positive for division
    d: number(0.1, 0.9, 2), // Decimal values
    e: number(-10, 10),
    f: picker(
        { x: 10, y: 20 },
        { x: -5, y: 15 },
        { x: 0, y: 0 }
    ),
    string: picker('hello', 'world', '123', ''),
    bool: picker(true, false),
    date: () => new Date('2024-04-30'),
    null: () => null,
    undefined: () => undefined,
})

export type ExprDocument = MongoDocument<ReturnType<typeof document>>

export const expr: Catalog<ExprDocument> = {
    operations: [
        // $expr with comparison operators (from evaluation)
        { $expr: { $gt: ['$a', 0] } },
        { $expr: { $gte: ['$a', 0] } },
        { $expr: { $lt: ['$a', 0] } },
        { $expr: { $lte: ['$a', 0] } },
        { $expr: { $eq: ['$a', '$b'] } },
        { $expr: { $ne: ['$a', '$b'] } },

        // Arithmetic operators from expr.js
        // $abs - Absolute value
        { $expr: { $abs: '$a' } },
        { $expr: { $abs: '$b' } },
        { $expr: { $abs: '$c' } },
        { $expr: { $abs: '$d' } },
        { $expr: { $abs: '$e' } },

        // $add - Addition
        { $expr: { $add: ['$a', '$b'] } },
        { $expr: { $add: ['$a', '$b', '$c'] } },
        { $expr: { $add: ['$a', 10] } },
        { $expr: { $add: [1, 2, 3] } },

        // $ceil - Ceiling
        { $expr: { $ceil: '$a' } },
        { $expr: { $ceil: '$d' } },
        { $expr: { $ceil: -1.5 } },

        // $divide - Division
        { $expr: { $divide: ['$a', '$c'] } },
        { $expr: { $divide: ['$b', 2] } },
        { $expr: { $divide: [100, '$c'] } },

        // $exp - Exponential (e^x)
        { $expr: { $exp: '$c' } },
        { $expr: { $exp: 1 } },
        { $expr: { $exp: 0 } },

        // $floor - Floor
        { $expr: { $floor: '$a' } },
        { $expr: { $floor: '$d' } },
        { $expr: { $floor: -1.5 } },

        // $ln - Natural logarithm
        { $expr: { $ln: '$c' } },
        { $expr: { $ln: 1 } },
        { $expr: { $ln: 2.718 } },

        // $log - Logarithm with base
        { $expr: { $log: ['$c', 2] } },
        { $expr: { $log: [100, 10] } },
        { $expr: { $log: ['$a', '$c'] } },

        // $log10 - Base-10 logarithm
        { $expr: { $log10: '$c' } },
        { $expr: { $log10: 100 } },
        { $expr: { $log10: 1 } },

        // $multiply - Multiplication
        { $expr: { $multiply: ['$a', '$b'] } },
        { $expr: { $multiply: ['$a', '$b', '$c'] } },
        { $expr: { $multiply: [2, 3, 4] } },

        // $pow - Power/exponentiation
        { $expr: { $pow: ['$c', 2] } },
        { $expr: { $pow: [2, '$c'] } },
        { $expr: { $pow: ['$a', 2] } },

        // $sqrt - Square root
        { $expr: { $sqrt: '$c' } },
        { $expr: { $sqrt: 16 } },
        { $expr: { $sqrt: '$a' } },

        // $subtract - Subtraction
        { $expr: { $subtract: ['$a', '$b'] } },
        { $expr: { $subtract: ['$b', '$a'] } },
        { $expr: { $subtract: [100, '$c'] } },

        // $trunc - Truncate
        { $expr: { $trunc: '$a' } },
        { $expr: { $trunc: '$d' } },
        { $expr: { $trunc: -1.9 } },

        // Complex expressions with field references
        { $expr: { $abs: '$f.x' } },
        { $expr: { $add: ['$f.x', '$f.y'] } },
        { $expr: { $divide: ['$f.x', '$f.y'] } },

        // Error cases
        { $expr: { $divide: ['$a', 0] } }, // Division by zero
        { $expr: { $divide: ['$string', 1] } }, // String division
        { $expr: { $ln: 0 } }, // Log of zero
        { $expr: { $ln: -1 } }, // Log of negative
        { $expr: { $sqrt: -1 } }, // Sqrt of negative
        { $expr: { $log: ['$a', 0] } }, // Log with base 0
        { $expr: { $log: ['$a', -1] } }, // Log with negative base

        // Missing/incorrect arguments
        { $expr: { $add: [] } }, // Empty add
        { $expr: { $multiply: [] } }, // Empty multiply
        { $expr: { $divide: ['$a'] } }, // Missing divisor
        { $expr: { $log: ['$a'] } }, // Missing base

        // Invalid types
        { $expr: { $abs: '$string' } },
        { $expr: { $abs: '$bool' } },
        { $expr: { $add: ['$a', '$string'] } },
        { $expr: { $ceil: '$string' } },
        { $expr: { $ln: '$string' } },

        // Null/undefined handling
        { $expr: { $abs: '$null' } },
        { $expr: { $add: ['$a', '$null'] } },
        { $expr: { $abs: '$undefined' } },
    ],
    collection: {
        records: Array.from({ length: 25 }, (_, i) => document(i)),
    },
}
