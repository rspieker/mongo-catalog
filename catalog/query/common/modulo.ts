import {
    compile,
    number,
    picker,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with numeric values for modulo testing
const document = compile({
    value: number(0, 100), // 0-100 range for various modulo tests
    count: number(1, 50), // 1-50 for smaller modulo tests
    quantity: number(0, 200), // 0-200 for larger range
    size: number(1, 20), // Small values for modulo with small divisors
    index: number(0, 99), // Sequential-like values
    category: picker('A', 'B', 'C', 'D', 'E'),
})

export type ModuloDocument = MongoDocument<ReturnType<typeof document>>

export const modulo: Catalog<ModuloDocument> = {
    operations: [
        // $mod - Remainder operations
        // Divisor 2 (even/odd)
        { value: { $mod: [2, 0] } }, // Even numbers
        { value: { $mod: [2, 1] } }, // Odd numbers
        { count: { $mod: [2, 0] } },
        { count: { $mod: [2, 1] } },
        
        // Divisor 3
        { value: { $mod: [3, 0] } }, // Divisible by 3
        { value: { $mod: [3, 1] } }, // Remainder 1 when divided by 3
        { value: { $mod: [3, 2] } }, // Remainder 2 when divided by 3
        { quantity: { $mod: [3, 0] } },
        
        // Divisor 4
        { value: { $mod: [4, 0] } },
        { value: { $mod: [4, 1] } },
        { value: { $mod: [4, 2] } },
        { value: { $mod: [4, 3] } },
        
        // Divisor 5
        { value: { $mod: [5, 0] } },
        { value: { $mod: [5, 1] } },
        { value: { $mod: [5, 2] } },
        { value: { $mod: [5, 3] } },
        { value: { $mod: [5, 4] } },
        { quantity: { $mod: [5, 0] } },
        
        // Divisor 7
        { value: { $mod: [7, 0] } },
        { value: { $mod: [7, 1] } },
        { quantity: { $mod: [7, 0] } },
        { quantity: { $mod: [7, 1] } },
        
        // Divisor 10 (decades)
        { value: { $mod: [10, 0] } }, // Multiples of 10
        { value: { $mod: [10, 5] } }, // Ends in 5
        { index: { $mod: [10, 0] } },
        
        // Larger divisors
        { value: { $mod: [20, 0] } },
        { value: { $mod: [25, 0] } },
        { quantity: { $mod: [50, 0] } },
        
        // Small field values with small divisors
        { size: { $mod: [3, 0] } },
        { size: { $mod: [5, 0] } },
        { size: { $mod: [7, 0] } },
        
        // Error cases
        { value: { $mod: [0, 0] } }, // Division by zero
        { value: { $mod: [0, 1] } }, // Division by zero with remainder
        { value: { $mod: [-1, 0] } }, // Negative divisor
        { value: { $mod: [2, -1] } }, // Negative remainder
        { value: { $mod: [2, 5] } }, // Remainder >= divisor
        { value: { $mod: 'invalid' } }, // Invalid type
        { value: { $mod: [1] } }, // Missing remainder
        { value: { $mod: [] } }, // Empty array
        
        // Combined with other operators
        { value: { $mod: [2, 0], $gte: 10 } }, // Even and >= 10
        { value: { $mod: [2, 1], $lt: 50 } }, // Odd and < 50
        { quantity: { $mod: [5, 0], $gte: 50 } }, // Multiple of 5 and >= 50
        
        // Edge cases
        { value: { $mod: [1, 0] } }, // Divisor 1 (always remainder 0)
        { value: { $mod: [100, 0] } }, // Large divisor
        { value: { $mod: [100, 50] } }, // Large divisor with remainder
    ],
    collection: {
        records: Array.from({ length: 30 }, (_, i) => document(i)),
    },
}
