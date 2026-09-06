import type { Catalog, MongoDocument } from '../../catalog'

// {field: <object>} without a $-prefixed key is a literal whole-value
// equality check (deep equality, no partial/superset match, no implicit
// per-key field delegation) — distinct from {field: {$op: ...}}, which is
// an operator expression. Confirmed via docker against a live mongod
// before writing this:
// - {field: {}} matches only a document whose field is *exactly* {},
//   not one where field is missing, nor one where field is any other
//   object — it is not a "no constraint" no-op.
// - {field: {foo: 1}} does not match a superset ({foo: 1, bar: 2}) or a
//   subset/disjoint object — exact deep equality only.
// - {field: {bar: {$gt: 0}, foo: 1}} is *not* "field.bar > 0 AND
//   field.foo == 1" — since neither top-level key of the value starts
//   with $, the whole object is the literal equality target (matching
//   MongoDB's actual rule: nested fields are only reachable via dot
//   notation, e.g. "field.bar", never via bare nesting).
// - {field: {$eq: <object>}} (explicit) behaves identically to the
//   implicit form for the same object.
// Mixing a $-prefixed key with a non-$-prefixed key in the same object
// (e.g. {$exists: {...}, foo: 1}) is deliberately NOT covered here — that
// turned out to be its own order-dependent behavior, inconsistent between
// a plain nested field and $elemMatch's own parsing, and needs its own
// dedicated investigation before it's meaningful to assert ground truth
// against.
export type NestedEqualityDocument = MongoDocument<{
    field?: unknown
}>

export const nestedEquality: Catalog<NestedEqualityDocument> = {
    description:
        'Literal whole-value equality for object-valued fields, vs. operator-expression dispatch',
    category: 'comparison',
    operations: [
        // implicit form
        { field: {} },
        { field: { foo: 1 } },
        { field: { foo: 1, bar: 2 } },
        { field: { bar: 2 } },
        { field: { foo: 2 } },
        // explicit $eq, should behave identically to the implicit form
        { field: { $eq: {} } },
        { field: { $eq: { foo: 1 } } },
        { field: { $eq: { foo: 1, bar: 2 } } },
        // a value-operator nested inside a non-$-prefixed key is part of
        // the literal target, not a dispatched condition
        { field: { bar: { $gt: 0 }, foo: 1 } },
        { field: { foo: 1, bar: { $gt: 0 } } },
    ],
    collection: {
        records: <Array<NestedEqualityDocument & { _id: number }>>[
            { _id: 0 }, // field entirely missing
            { _id: 1, field: {} }, // exact empty-object match
            { _id: 2, field: { foo: 1 } }, // exact single-key match
            { _id: 3, field: { foo: 1, bar: 2 } }, // superset of {foo: 1}
            { _id: 4, field: { bar: 2 } }, // disjoint key from {foo: 1}
            { _id: 5, field: { foo: 2 } }, // same key, different value
            { _id: 6, field: 'not-an-object' }, // type mismatch
            { _id: 7, field: null },
            { _id: 8, field: [] },
        ],
    },
}
