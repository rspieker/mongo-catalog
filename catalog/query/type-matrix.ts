import {
    ALL_VALUES,
    NUMBER_RANGE,
    SCALAR_VALUES,
    STRING_RANGE,
} from '../../source/domain/generator/type-matrix';
import { Catalog, MongoDocument } from '../catalog';

// Cross every predicate operator against a shared, deliberately adversarial
// set of BSON values and shapes (source/domain/generator/type-matrix.ts).
// This is additive, not a replacement for the hand-written common/*.ts
// catalogs: the coverage here overlaps with them on purpose — a repeated
// assertion is preferred over a gap.
//
// Verified empirically against a live mongod before building this: none of
// the operators below throw on a per-document type mismatch when run against
// a batched, heterogeneous collection — MongoDB's matcher fails closed
// (no match) rather than aborting the query. That does NOT hold for $expr /
// aggregation-expression evaluation, which is why this catalog only covers
// plain query-predicate operators, not $expr.

type TypeMatrixDocument = MongoDocument<{ value?: unknown }>;

const records: Array<TypeMatrixDocument & { _id: number }> = [
    ...ALL_VALUES.map((value, i) => ({ _id: i, value })),
    { _id: ALL_VALUES.length }, // deliberately missing `value` field
];

// $eq/$ne/$gt/$gte/$lt/$lte accept literally any BSON value as the operand,
// so the full cross (every value as both document field and operand) is
// meaningful — including NUMBER_RANGE/STRING_RANGE/DATE_RANGE, which is what
// confirms ordinary range-boundary matching, not just type-mismatch handling.
const comparisonOperations = ALL_VALUES.flatMap((operand) => [
    { value: { $eq: operand } },
    { value: { $ne: operand } },
    { value: { $gt: operand } },
    { value: { $gte: operand } },
    { value: { $lt: operand } },
    { value: { $lte: operand } },
]);

// $in/$nin take an array operand, so instead of the full cross, a curated
// set of arrays: same-type subsets (real matches), a mixed-type array, an
// empty array, and an invalid (non-array) operand.
const IN_OPERANDS: ReadonlyArray<unknown> = [
    NUMBER_RANGE.slice(2, 5),
    STRING_RANGE.slice(0, 3),
    [true, false],
    [1, 'string', null],
    [],
    'not-an-array',
];
const inOperations = IN_OPERANDS.flatMap((operand) => [
    { value: { $in: operand } },
    { value: { $nin: operand } },
]);

const existsOperations = [true, false, 1, 0, 'yes', null].map((operand) => ({
    value: { $exists: operand },
}));

const TYPE_OPERANDS: ReadonlyArray<unknown> = [
    'string',
    'number',
    'bool',
    'array',
    'object',
    'date',
    'null',
    'regexp',
    'undefined',
    2, // string
    16, // 32-bit int
    8, // bool
    4, // array
    3, // object
    9, // date
    10, // null
    ['string', 'number'],
    'not-a-real-type',
    999,
];
const typeOperations = TYPE_OPERANDS.map((operand) => ({
    value: { $type: operand },
}));

const ALL_OPERANDS: ReadonlyArray<unknown> = [
    [1, 2, 3],
    [1],
    [],
    'not-an-array',
    [null],
];
const allOperations = ALL_OPERANDS.map((operand) => ({
    value: { $all: operand },
}));

const elemMatchOperations = [
    { $gt: 1 },
    { $eq: 2 },
    { a: { $gt: 1 } },
    { a: 1 },
    {},
    'invalid',
].map((operand) => ({ value: { $elemMatch: operand } }));

// Sizes matching known array lengths in SCALAR_VALUES/STRUCTURAL_VALUES
// (0, 1, 2, 3, 6), plus invalid shapes.
const SIZE_OPERANDS: ReadonlyArray<unknown> = [
    0, 1, 2, 3, 6, -1, 2.5, '2', null,
];
const sizeOperations = SIZE_OPERANDS.map((operand) => ({
    value: { $size: operand },
}));

const BIT_OPERANDS: ReadonlyArray<unknown> = [
    0,
    1,
    2,
    3,
    4,
    7,
    8,
    15,
    -1,
    [0],
    [0, 1],
    [-1],
    [],
    // Adversarial BSON values as both a bare mask and a single-element
    // position array
    ...SCALAR_VALUES,
    ...SCALAR_VALUES.map((value) => [value]),
    // Position-array boundary: INT32_MAX is valid and INT32_MAX + 1 throws.
    [100],
    [2147483647],
    [2147483648],
];
const bitwiseOperations = BIT_OPERANDS.flatMap((operand) => [
    { value: { $bitsAllClear: operand } },
    { value: { $bitsAllSet: operand } },
    { value: { $bitsAnyClear: operand } },
    { value: { $bitsAnySet: operand } },
]);

const MOD_OPERANDS: ReadonlyArray<unknown> = [
    [2, 0],
    [2, 1],
    [3, 0],
    [1, 0],
    [0, 0], // division by zero
    ['a', 0], // invalid divisor type
    [2, 'a'], // invalid remainder type
    [2], // missing remainder
    2, // not an array at all
];
const modOperations = MOD_OPERANDS.map((operand) => ({
    value: { $mod: operand },
}));

export const typeMatrix: Catalog<TypeMatrixDocument> = {
    description:
        'Cross every plain query-predicate operator against a shared set of adversarial BSON values and shapes',
    category: 'type-matrix',
    operations: [
        ...comparisonOperations,
        ...inOperations,
        ...existsOperations,
        ...typeOperations,
        ...allOperations,
        ...elemMatchOperations,
        ...sizeOperations,
        ...bitwiseOperations,
        ...modOperations,
    ],
    collection: {
        records,
    },
};
