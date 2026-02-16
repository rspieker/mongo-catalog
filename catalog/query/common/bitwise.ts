import {
    compile,
    number,
    picker,
    range,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with various bit patterns
// Values 0-127 cover all 7-bit combinations
const document = compile({
    value: number(0, 127),
    flags: number(0, 15), // 4-bit flags (0-15)
    permissions: number(0, 7), // 3-bit permissions (0-7)
    status: picker('active', 'inactive', 'pending', 'deleted'),
    bitmask: () => {
        // Generate specific bit patterns for testing
        const patterns = [0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 31, 32, 63, 64, 127]
        return patterns[Math.floor(Math.random() * patterns.length)]
    },
})

export type BitwiseDocument = MongoDocument<ReturnType<typeof document>>

export const bitwise: Catalog<BitwiseDocument> = {
    operations: [
        // $bitsAllClear - All specified bits are clear (0)
        { value: { $bitsAllClear: 0 } }, // Should match all (no bits to check)
        { value: { $bitsAllClear: 1 } }, // Bit 0 must be clear
        { value: { $bitsAllClear: 2 } }, // Bit 1 must be clear
        { value: { $bitsAllClear: 3 } }, // Bits 0 and 1 must be clear
        { value: { $bitsAllClear: 4 } }, // Bit 2 must be clear
        { value: { $bitsAllClear: [0] } }, // Bit 0 must be clear (array form)
        { value: { $bitsAllClear: [1] } }, // Bit 1 must be clear
        { value: { $bitsAllClear: [0, 1] } }, // Bits 0 and 1 must be clear
        { value: { $bitsAllClear: [0, 1, 2] } }, // Bits 0, 1, 2 must be clear
        { value: { $bitsAllClear: 8 } }, // Bit 3 must be clear
        { value: { $bitsAllClear: 15 } }, // Bits 0-3 must be clear
        { value: { $bitsAllClear: 16 } }, // Bit 4 must be clear
        { value: { $bitsAllClear: 31 } }, // Bits 0-4 must be clear
        { value: { $bitsAllClear: 32 } }, // Bit 5 must be clear
        { value: { $bitsAllClear: 63 } }, // Bits 0-5 must be clear
        { value: { $bitsAllClear: 64 } }, // Bit 6 must be clear
        { value: { $bitsAllClear: 127 } }, // Bits 0-6 must be clear (only value 0 matches)
        
        // Error cases - negative values
        { value: { $bitsAllClear: -1 } },
        { value: { $bitsAllClear: [-1] } },

        // $bitsAllSet - All specified bits are set (1)
        { value: { $bitsAllSet: 0 } }, // Should match all (no bits to check)
        { value: { $bitsAllSet: 1 } }, // Bit 0 must be set
        { value: { $bitsAllSet: 2 } }, // Bit 1 must be set
        { value: { $bitsAllSet: 3 } }, // Bits 0 and 1 must be set
        { value: { $bitsAllSet: 4 } }, // Bit 2 must be set
        { value: { $bitsAllSet: [0] } }, // Bit 0 must be set (array form)
        { value: { $bitsAllSet: [1] } }, // Bit 1 must be set
        { value: { $bitsAllSet: [0, 1] } }, // Bits 0 and 1 must be set
        { value: { $bitsAllSet: [0, 1, 2] } }, // Bits 0, 1, 2 must be set
        { value: { $bitsAllSet: 7 } }, // Bits 0-2 must be set
        { value: { $bitsAllSet: 8 } }, // Bit 3 must be set
        { value: { $bitsAllSet: 15 } }, // Bits 0-3 must be set
        { value: { $bitsAllSet: 16 } }, // Bit 4 must be set
        { value: { $bitsAllSet: 31 } }, // Bits 0-4 must be set
        { value: { $bitsAllSet: 32 } }, // Bit 5 must be set
        { value: { $bitsAllSet: 63 } }, // Bits 0-5 must be set
        { value: { $bitsAllSet: 64 } }, // Bit 6 must be set
        { value: { $bitsAllSet: 127 } }, // Bits 0-6 must be set (only value 127 matches)
        
        // Error cases - negative values
        { value: { $bitsAllSet: -1 } },
        { value: { $bitsAllSet: [-1] } },

        // $bitsAnyClear - At least one specified bit is clear (0)
        { value: { $bitsAnyClear: 0 } }, // No bits to check (matches all?)
        { value: { $bitsAnyClear: 1 } }, // Bit 0 is clear in some values
        { value: { $bitsAnyClear: 2 } }, // Bit 1 is clear in some values
        { value: { $bitsAnyClear: 3 } }, // Either bit 0 or 1 is clear
        { value: { $bitsAnyClear: [0] } }, // Bit 0 is clear (array form)
        { value: { $bitsAnyClear: [0, 1] } }, // Either bit 0 or 1 is clear
        { value: { $bitsAnyClear: 15 } }, // At least one of bits 0-3 is clear
        { value: { $bitsAnyClear: 127 } }, // At least one of bits 0-6 is clear
        
        // Error cases - negative values
        { value: { $bitsAnyClear: -1 } },
        { value: { $bitsAnyClear: [-1] } },

        // $bitsAnySet - At least one specified bit is set (1)
        { value: { $bitsAnySet: 0 } }, // No bits to check (matches none?)
        { value: { $bitsAnySet: 1 } }, // Bit 0 is set in some values
        { value: { $bitsAnySet: 2 } }, // Bit 1 is set in some values
        { value: { $bitsAnySet: 3 } }, // Either bit 0 or 1 is set
        { value: { $bitsAnySet: [0] } }, // Bit 0 is set (array form)
        { value: { $bitsAnySet: [0, 1] } }, // Either bit 0 or 1 is set
        { value: { $bitsAnySet: 15 } }, // At least one of bits 0-3 is set
        { value: { $bitsAnySet: 127 } }, // At least one of bits 0-6 is set
        
        // Error cases - negative values
        { value: { $bitsAnySet: -1 } },
        { value: { $bitsAnySet: [-1] } },

        // Empty array cases
        { value: { $bitsAllClear: [] } },
        { value: { $bitsAllSet: [] } },
        { value: { $bitsAnyClear: [] } },
        { value: { $bitsAnySet: [] } },

        // Edge cases with different fields
        { flags: { $bitsAllClear: 1 } },
        { flags: { $bitsAllSet: 8 } },
        { permissions: { $bitsAllClear: 2 } },
        { permissions: { $bitsAllSet: 4 } },
        { bitmask: { $bitsAllClear: 15 } },
        { bitmask: { $bitsAllSet: 3 } },
    ],
    collection: {
        records: Array.from({ length: 30 }, (_, i) => document(i)),
    },
}
