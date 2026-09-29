import type { Catalog, MongoDocument } from '../../catalog'

// $text ground truth against a legacy TEXT_INDEX_VERSION_1 index — nobody
// creates this by default anymore (current default is V3), but
// mongo-catalog exists to capture real behavioral differences, and V1 has
// two documented ones (fts_language.cpp, kLanguagesV1 vs kLanguagesV2V3):
//
//   1. Language matching is case-SENSITIVE in V1 (case-insensitive in V2/V3).
//   2. V1 recognizes many more aliases per language (3-letter ISO 639-2
//      bibliographic/terminology codes: "dut"/"nld", "ger"/"deu", etc. — see
//      research on the modern-index $language matrix in text-single-field.ts)
//      and silently falls back to "none" for anything unrecognized, instead
//      of erroring the way V2/V3 does.
//
// A minimal collection: just enough content to re-run the same $language
// validity probes as the V2/V3 matrix, plus one case-sensitivity probe,
// against a V1 index specifically.

type TextIndexV1Document = MongoDocument<{
	_id: number
	content: string
}>

const records: Array<TextIndexV1Document> = [
	{ _id: 0, content: 'the door was opened this morning' },
	{ _id: 1, content: 'ENGLISH in capitals, to probe V1 case-sensitive language matching' },
]

export const textIndexV1: Catalog<TextIndexV1Document> = {
	description: '$text ground truth against a legacy TEXT_INDEX_VERSION_1 index — $language alias/case-sensitivity behavioral differences from the modern V2/V3 default',
	operations: [
		{ $text: { $search: 'open' } }, // implicit default
		{ $text: { $search: 'open', $language: 'none' } },
		{ $text: { $search: 'open', $language: 'und' } }, // still not registered even in V1 — expect fallback-to-none, not an error
		{ $text: { $search: 'open', $language: 'english' } },
		{ $text: { $search: 'open', $language: 'en' } },
		{ $text: { $search: 'open', $language: 'eng' } }, // valid in V1, unlike V2/V3
		{ $text: { $search: 'open', $language: 'ENGLISH' } }, // case variant — V1's language matching is case-sensitive
		{ $text: { $search: 'open', $language: 'dutch' } },
		{ $text: { $search: 'open', $language: 'nl' } },
		{ $text: { $search: 'open', $language: 'dut' } }, // valid in V1
		{ $text: { $search: 'open', $language: 'nld' } }, // valid in V1
		{ $text: { $search: 'open', $language: 'german' } },
		{ $text: { $search: 'open', $language: 'de' } },
		{ $text: { $search: 'open', $language: 'deu' } }, // valid in V1
		{ $text: { $search: 'open', $language: 'ger' } }, // valid in V1
		{ $text: { $search: 'open', $language: 'klingon' } }, // genuinely unrecognized — expect silent fallback to "none", not an error (V1's documented behavior, unlike V2/V3)
	],
	collection: {
		indices: [{ keys: { content: 'text' }, options: { textIndexVersion: 1 } }],
		records,
	},
}
