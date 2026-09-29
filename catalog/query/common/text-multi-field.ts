import type { Catalog, MongoDocument } from '../../catalog'

// $text ground truth against a compound 2-field text index. The question
// this collection answers: does $text treat a document's indexed terms as
// one combined bag across both fields (OR-across-fields for word matching),
// and does phrase matching require the phrase to be contiguous within a
// single field, or can it span a field boundary?

type TextMultiFieldDocument = MongoDocument<{
	_id: number
	title: string
	body: string
}>

const records: Array<TextMultiFieldDocument> = [
	{ _id: 0, title: 'quick fox', body: 'nothing relevant here' }, // "quick fox" contiguous, within title only
	{ _id: 1, title: 'nothing relevant here', body: 'quick fox' }, // "quick fox" contiguous, within body only
	{ _id: 2, title: 'quick', body: 'fox' }, // split across fields — not adjacent anywhere
	{ _id: 3, title: 'slow fox', body: 'slow fox' }, // neither field has "quick"
	{ _id: 4, title: 'quick brown', body: 'brown fox' }, // "brown" repeated in both fields
	{ _id: 5, title: 'lazy dog', body: 'the dog sleeps all day' }, // negation target for "-dog"
]

export const textMultiField: Catalog<TextMultiFieldDocument> = {
	description: '$text ground truth against a compound 2-field text index — OR-across-fields word matching and whether phrase matching can span a field boundary',
	operations: [
		{ $text: { $search: 'quick' } }, // matches wherever "quick" appears, in either field
		{ $text: { $search: 'fox' } },
		{ $text: { $search: 'quick fox' } }, // 2 positive words — does a term split across fields (doc 2) still satisfy both?
		{ $text: { $search: 'quick -dog' } },
		{ $text: { $search: '"quick fox"' } }, // exact phrase — expect only docs where it's contiguous within one field (0, 1), not doc 2
		{ $text: { $search: 'brown' } },
	],
	collection: {
		indices: [{ title: 'text', body: 'text' }],
		records,
	},
}
