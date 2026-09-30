import type { Catalog, MongoDocument } from '../../catalog'

// $text ground truth for a specific, sharply-isolated finding: words with
// an internal apostrophe (English contractions, Dutch plural -'s and
// temporal 's-) become unsearchable by *any* natural search term once
// English stemming is applied at index time — confirmed via direct
// verification (default_language: "none" restores searchability for the
// exact same content), so this is a stemming-layer problem, not a
// tokenizer/delimiter one. German has no comparable everyday
// apostrophe-contraction usage, so isn't tested here.
//
// Dutch content is deliberately verbatim from a cited source
// (https://webwoordenboek.nl/kenniscentrum/hoe-schrijf-je-s-middags-of-s-middags)
// and from the user's own message, not hand-constructed — avoids
// introducing invented, possibly-incorrect Dutch (the same lesson learned
// earlier authoring the English/German/Dutch stemming pairs).
//
// Per-document `language` uses MongoDB's default `language_override` field
// name, same mechanism as text-single-field.ts's stemming pairs — one
// collection hosts every language/stemming combination needed.

type TextContractionDocument = MongoDocument<{
	_id: number
	content: string
	language?: string
}>

const records: Array<TextContractionDocument> = [
	// English contraction, across implicit-default / explicit-'en' / 'none'
	{ _id: 0, content: "I don't believe this doesn't work" }, // implicit default (index default_language: english)
	{ _id: 1, content: "I don't believe this doesn't work", language: 'en' },
	{ _id: 2, content: "I don't believe this doesn't work", language: 'none' },

	// Dutch plural -'s (opa's, auto's, baby's, ...), 'nl' vs 'none'
	{ _id: 3, content: "opa's, azalea's, ave's, ski's, auto's, accu's, baby's", language: 'nl' },
	{ _id: 4, content: "opa's, azalea's, ave's, ski's, auto's, accu's, baby's", language: 'none' },

	// Dutch temporal 's- ("des"), 'nl' vs 'none'
	{ _id: 5, content: "'s ochtends, 's middags, 's avonds, 's nachts", language: 'nl' },
	{ _id: 6, content: "'s ochtends, 's middags, 's avonds, 's nachts", language: 'none' },
]

export const textContraction: Catalog<TextContractionDocument> = {
	description: '$text ground truth for apostrophe-containing words (English contractions, Dutch plural -\'s and temporal \'s-) across default_language configurations — isolates whether unsearchability is a stemming-layer or tokenizer-layer problem',
	operations: [
		// English "don't" — unquoted, quoted, apostrophe-stripped, prefix-only
		{ $text: { $search: "don't" } },
		{ $text: { $search: '"don\'t"' } },
		{ $text: { $search: 'dont' } },
		{ $text: { $search: 'don' } },
		{ $text: { $search: "doesn't" } },

		// Dutch plural -'s — unquoted, quoted, apostrophe-stripped, bare word
		{ $text: { $search: "auto's" } },
		{ $text: { $search: '"auto\'s"' } },
		{ $text: { $search: 'autos' } },
		{ $text: { $search: 'auto' } },
		{ $text: { $search: "baby's" } },

		// Dutch temporal 's- — unquoted, quoted, apostrophe-stripped, bare word
		{ $text: { $search: "'s ochtends" } },
		{ $text: { $search: '"\'s ochtends"' } },
		{ $text: { $search: 's ochtends' } },
		{ $text: { $search: 'ochtends' } },
	],
	collection: {
		indices: [{ content: 'text' }],
		records,
	},
}
