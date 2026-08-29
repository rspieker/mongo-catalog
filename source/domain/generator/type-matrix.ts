// A curated, deliberately adversarial set of BSON-representable values used
// to probe operator behavior across type boundaries (see
// catalog/query/type-matrix.ts). Unlike the rest of this directory, these
// values are fixed and hand-reviewed rather than seeded/randomized — the
// point is precise, reproducible edge cases, not variety.

// One representative per interesting BSON-comparable type/edge case. Not
// exhaustive of every BSON type (no Decimal128/ObjectId/MinKey/MaxKey yet) —
// extend this list first if a gap is found rather than building a parallel
// list elsewhere.
export const SCALAR_VALUES: ReadonlyArray<unknown> = [
    true,
    false,
    0,
    1,
    -1,
    0.5,
    -0.5,
    NaN,
    Infinity,
    -Infinity,
    100000000000, // exceeds 32-bit int range
    -100000000000,
    '',
    'string',
    [],
    [1, 2, 3],
    [1, 'string', true, false, null, {}], // mixed-type array
    {},
    { a: 1 },
    { a: { b: 1 } }, // nested object
    null,
    /^bar/,
    /^bar/i,
    new Date(0),
    new Date('2020-01-01T00:00:00Z'),
];

// Representative array/object shapes, aimed specifically at MongoDB's
// implicit array-element traversal and array-of-objects dotted-path
// flattening — behavior plain scalars never exercise.
export const STRUCTURAL_VALUES: ReadonlyArray<unknown> = [
    [1, 2, 3], // flat array of scalars
    [
        [1, 2],
        [3, 4],
    ], // array of arrays
    [{ a: 1 }, { a: 2 }], // array of objects (dotted-path reach-in)
    { list: [1, 2, 3] }, // object containing an array
    [], // empty array
    [null], // array containing null
    [1, [2, 3], { a: 4 }], // mixed nesting
];

// Ordered, same-type ranges. SCALAR_VALUES is built for type diversity, not
// same-type ordering — on its own it can never confirm ordinary
// $gt/$gte/$lt/$lte/$in/$nin behavior (a clean "matches 6-10 out of 1-10").
export const NUMBER_RANGE: ReadonlyArray<number> = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];
export const STRING_RANGE: ReadonlyArray<string> = [
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
];
export const DATE_RANGE: ReadonlyArray<Date> = [
    new Date('2020-01-01'),
    new Date('2020-01-02'),
    new Date('2020-01-03'),
    new Date('2020-01-04'),
    new Date('2020-01-05'),
];

// The full set, combined — used both to build the catalog's documents and
// (mapped again) its comparison-family operations. Same array, two roles.
export const ALL_VALUES: ReadonlyArray<unknown> = [
    ...SCALAR_VALUES,
    ...STRUCTURAL_VALUES,
    ...NUMBER_RANGE,
    ...STRING_RANGE,
    ...DATE_RANGE,
];
