import type { Catalog, MongoDocument } from '../../catalog'

// $text ground truth against a wildcard ($**) text index — every string
// field gets indexed automatically, regardless of shape: top-level string,
// array of strings, string nested in a subdocument, and (as a contrast)
// non-string fields should be silently skipped rather than erroring or
// getting stringified into the index.

type TextWildcardDocument = MongoDocument<{
	_id: number
	title: string
	tags: Array<string>
	meta: { note: string }
	count: number
}>

const records: Array<TextWildcardDocument> = [
	{ _id: 0, title: 'quick brown fox', tags: ['lazy', 'dog'], meta: { note: 'nothing here' }, count: 1 },
	{ _id: 1, title: 'nothing relevant', tags: ['quick', 'brown'], meta: { note: 'irrelevant' }, count: 2 }, // term only in the array
	{ _id: 2, title: 'nothing relevant', tags: ['irrelevant'], meta: { note: 'quick brown fox nested' }, count: 3 }, // term only in the nested string
	{ _id: 3, title: 'the count matters', tags: [], meta: { note: 'plain' }, count: 99 }, // "99" exists only as a number, not indexed text
	{ _id: 4, title: 'plain doc', tags: ['single'], meta: { note: 'plain' }, count: 4 },
]

export const textWildcard: Catalog<TextWildcardDocument> = {
	description: '$text ground truth against a wildcard ($**) text index — array-of-strings, nested string, and non-string fields (should be silently skipped)',
	operations: [
		{ $text: { $search: 'quick' } }, // spans all three string locations: title (0), array (1), nested (2)
		{ $text: { $search: 'brown' } },
		{ $text: { $search: 'lazy' } }, // array element match
		{ $text: { $search: 'nested' } }, // nested subdocument string match
		{ $text: { $search: '99' } }, // should not match doc 3's numeric count field
	],
	collection: {
		indices: [{ '$**': 'text' }],
		records,
	},
}
