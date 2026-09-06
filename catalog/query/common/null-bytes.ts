import type { Catalog, MongoDocument } from '../../catalog'

// Null bytes (\0) show up in more places than just "a field name" — dotted
// paths, array paths, and operator keys are all still just strings under
// the hood, and confirmed via docker each gets rejected the same way. But
// it's *not* a blanket "reject \0 anywhere" rule:
// - A key (field name, at any position in a dotted/array path, or an
//   operator name) containing \0 always throws "key ... must not contain
//   null bytes" — checked before the key is even looked up as an operator
//   (a null-byte operator key throws this, not "unrecognized operator").
// - A plain string *value* containing \0 is completely fine — BSON
//   strings are length-prefixed, not null-terminated, so an embedded null
//   byte is valid content and round-trips correctly (confirmed: it
//   matches only the document whose value is byte-identical, not a
//   truncated/mangled prefix of it).
// - A regex *pattern* containing \0 is rejected either way it can arrive
//   (`{$regex: "..."}` string form or a literal RegExp/BSON-regex value)
//   — BSON's regex type is two null-terminated C-strings (pattern +
//   options), so an embedded null byte genuinely can't be represented,
//   unlike a plain string. The two forms throw different messages in real
//   MongoDB (a client-side driver check for the RegExp-object form vs. a
//   server-side one for the string form) — not asserted here since that's
//   a driver/server implementation split, not something meaningful to
//   pin down as "the" ground truth message.
export type NullByteDocument = MongoDocument<{
    age?: number
    foo?: { bar?: string }
    arr?: Array<{ name?: string }>
    text?: string
}>

export const nullBytes: Catalog<NullByteDocument> = {
    description:
        'Null bytes (\\0) in keys (any position, including dotted/array paths and operator names) vs. in string/regex values',
    category: 'misc',
    operations: [
        // key position: top-level, first dot-segment, second dot-segment,
        // array-path first segment, array-path second segment, operator
        { 'a\0ge': 10 },
        { 'fo\0o.bar': 'value' },
        { 'foo.ba\0r': 'value' },
        { 'ar\0r.name': 'value' },
        { 'arr.na\0me': 'value' },
        { age: { '$gt\0': 5 } },
        // value: a null byte is valid string content, not rejected
        { text: 'val\0ue' },
        // regex pattern: rejected either way it arrives
        { text: { $regex: 'val\0ue' } },
        { text: new RegExp('val\0ue') },
    ],
    collection: {
        records: <Array<NullByteDocument & { _id: number }>>[
            { _id: 0, age: 10 },
            { _id: 1, foo: { bar: 'value' } },
            { _id: 2, arr: [{ name: 'value' }, { name: 'other' }] },
            { _id: 3, text: 'value' },
            { _id: 4, text: 'val\0ue' },
        ],
    },
}
