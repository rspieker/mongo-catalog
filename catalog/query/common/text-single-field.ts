import type { Catalog, MongoDocument } from '../../catalog'

// $text ground truth, single named-field text index — the baseline shape.
// Companion catalogs cover the two other index shapes a text index can take
// (MongoDB allows exactly one text index per collection, so these can't
// share a collection): `text-multi-field.ts` (a compound text index over
// two fields, to check OR-across-fields behavior) and `text-wildcard.ts`
// (a `$**` wildcard text index, to check array/nested/non-string field
// handling). A fourth, `text-no-index.ts`, has no text index at all, to
// confirm the exact error $text throws without one.
//
// This collection carries the bulk of the taxonomy: all of the $search
// composition/negation combinations, the case/diacritic sensitivity option
// axis, the $language axis (including three real, human-verified stemming
// pairs — see research/ — one regular and one irregular case each for
// English/German/Dutch), the İstanbul diacritic-folding gotcha, three
// tokenization gotchas (hyphenation, contraction, letter+digit), the
// $and/$or/$nor combination checks, and malformed-$search-input handling.
//
// Per-document `language` uses MongoDB's default `language_override` field
// name, so a single text index can host documents stemmed under different
// languages — stemming is fixed at index-build time per document, not
// swayed by the query's own $language (confirmed via direct docker
// verification: see prior research notes).

type TextDocument = MongoDocument<{
	_id: number
	content: string
	secret?: string
	language?: string
}>

const records: Array<TextDocument> = [
	// --- basic word/phrase content ---
	{ _id: 0, content: 'the quick brown fox jumps over the lazy dog' },
	{ _id: 1, content: 'a slow red fox sleeps under the busy cat' },
	{ _id: 2, content: 'quick brown fox' }, // exact phrase candidate
	{ _id: 3, content: 'brown quick fox' }, // same words, reordered — word search yes, phrase no
	{ _id: 4, content: 'the fox is quick and very brown indeed' }, // words present, non-adjacent
	{ _id: 5, content: 'nothing relevant here at all' },
	{ _id: 6, content: 'QUICK BROWN FOX' }, // same words, uppercase — case-sensitivity test
	{ _id: 7, content: "the naïve café's façade" }, // diacritics — naïve café's façade
	{ _id: 8, content: 'İstanbul is a city' }, // İstanbul — the locked-in diacritic-folding gotcha
	{ _id: 9, content: 'the dotless ı character test' }, // dotless ı, Turkish-adjacent gotcha

	// --- tokenization gotchas ---
	{ _id: 10, content: 'state-of-the-art technology' }, // hyphenated compound
	{ _id: 11, content: "don't stop believing" }, // apostrophe/contraction
	{ _id: 12, content: 'room101 is available' }, // letter+digit term

	// --- English stemming: opened/opening/opener works, ran (irregular) never does ---
	{ _id: 13, content: 'the door was opened this morning', language: 'english' },
	{ _id: 14, content: 'the store is opening soon', language: 'english' },
	{ _id: 15, content: 'he is the opener of the show', language: 'english' },
	{ _id: 16, content: 'she was running fast', language: 'english' },
	{ _id: 17, content: 'he never runs anywhere', language: 'english' },
	{ _id: 18, content: 'he ran all the way home', language: 'english' },

	// --- German stemming: Häuser/Haus works, lief (irregular) never matches läuft/laufen ---
	{ _id: 19, content: 'die Häuser sind groß', language: 'german' },
	{ _id: 20, content: 'das Haus ist groß', language: 'german' },
	{ _id: 21, content: 'er läuft schnell', language: 'german' },
	{ _id: 22, content: 'wir werden laufen', language: 'german' },
	{ _id: 23, content: 'er lief gestern', language: 'german' },

	// --- Dutch stemming: vliegtuig/vliegtuigen works, ren* never matches anything (verified by a fluent speaker) ---
	{ _id: 24, content: 'het vliegtuig vertrekt nu', language: 'dutch' },
	{ _id: 25, content: 'de vliegtuigen zijn groot', language: 'dutch' },
	{ _id: 26, content: 'wij rennen elke dag', language: 'dutch' },
	{ _id: 27, content: 'hij rent hard', language: 'dutch' },
	{ _id: 28, content: 'zij rende gisteren', language: 'dutch' },

	// --- stop-word handling ---
	{ _id: 29, content: 'the a an is are was' }, // content is entirely English stop words
	{ _id: 30, content: 'elephant zebra giraffe' }, // control doc, also the "-zebra" exclusion target below

	// --- field-scoping contrast: term exists only in the unindexed field ---
	{ _id: 31, content: 'ordinary filler text here', secret: 'unindexedonlyterm quick brown fox' },
]

export const textSingleField: Catalog<TextDocument> = {
	description: '$text ground truth against a single named-field text index — search composition, negation, case/diacritic sensitivity, $language/stemming, tokenization gotchas, $and/$or/$nor combination, and malformed $search input',
	operations: [
		// --- Set B: options ---
		{ $text: { $search: 'brown' } },
		{ $text: { $search: 'BROWN' } }, // implicit default case-insensitive
		{ $text: { $search: 'BROWN', $caseSensitive: false } }, // explicit default
		{ $text: { $search: 'BROWN', $caseSensitive: true } },
		{ $text: { $search: 'cafe' } }, // implicit default diacritic-insensitive, should reach doc 7's "café"
		{ $text: { $search: 'cafe', $diacriticSensitive: false } }, // explicit default
		{ $text: { $search: 'cafe', $diacriticSensitive: true } },
		// İstanbul gotcha — full implicit/explicit cross-product of both sensitivity flags
		{ $text: { $search: 'istanbul' } }, // implicit default (both)
		{ $text: { $search: 'istanbul', $caseSensitive: true } },
		{ $text: { $search: 'istanbul', $caseSensitive: false } },
		{ $text: { $search: 'istanbul', $diacriticSensitive: true } },
		{ $text: { $search: 'istanbul', $diacriticSensitive: false } },
		{ $text: { $search: 'istanbul', $caseSensitive: true, $diacriticSensitive: true } },
		{ $text: { $search: 'istanbul', $caseSensitive: true, $diacriticSensitive: false } },
		{ $text: { $search: 'istanbul', $caseSensitive: false, $diacriticSensitive: true } },
		{ $text: { $search: 'istanbul', $caseSensitive: false, $diacriticSensitive: false } },
		// $language validity matrix against the modern (V2/V3) text index.
		// Query-time $language doesn't affect already-indexed stemming (fixed
		// per document at index-build time via the `language` field), so this
		// is really testing $language's own acceptance/rejection behavior.
		// Real MongoDB (fts_language.cpp, kLanguagesV2V3) accepts only a full
		// name + one 2-letter alias per language and rejects anything else
		// with a BadValue error — the 3-letter forms only exist for the
		// legacy TEXT_INDEX_VERSION_1, and `und` isn't registered at all,
		// under any index version.
		{ $text: { $search: 'open' } }, // implicit default — no $language specified
		{ $text: { $search: 'open', $language: 'none' } }, // explicit no-stemming
		{ $text: { $search: 'open', $language: 'und' } }, // not registered at all — expect error
		{ $text: { $search: 'open', $language: 'english' } },
		{ $text: { $search: 'open', $language: 'en' } },
		{ $text: { $search: 'open', $language: 'eng' } }, // V1-only alias — expect error on a V2/V3 index
		{ $text: { $search: 'open', $language: 'dutch' } },
		{ $text: { $search: 'open', $language: 'nl' } },
		{ $text: { $search: 'open', $language: 'dut' } }, // V1-only alias — expect error
		{ $text: { $search: 'open', $language: 'nld' } }, // V1-only alias — expect error
		{ $text: { $search: 'open', $language: 'german' } },
		{ $text: { $search: 'open', $language: 'de' } },
		{ $text: { $search: 'open', $language: 'deu' } }, // V1-only alias — expect error
		{ $text: { $search: 'open', $language: 'ger' } }, // V1-only alias — expect error
		{ $text: { $search: 'run' } },
		{ $text: { $search: 'lauf' } },
		{ $text: { $search: 'ren' } },
		{ $text: { $search: 'the' } }, // pure stop word search against doc 29

		// --- Set C: search composition ---
		{ $text: { $search: 'quick' } }, // single positive word
		{ $text: { $search: '-quick' } }, // single negative word alone — all-negated, expect no results
		{ $text: { $search: '"quick brown fox"' } }, // single positive phrase, exact
		{ $text: { $search: '-"quick brown fox"' } }, // single negative phrase alone — all-negated
		{ $text: { $search: 'quick fox' } }, // 2 positive words — AND vs OR semantics
		{ $text: { $search: '-quick -fox' } }, // 2 negative words — still all-negated
		{ $text: { $search: 'quick -lazy' } }, // mixed positive + negative word
		{ $text: { $search: '"quick brown fox" "lazy dog"' } }, // 2 positive phrases
		{ $text: { $search: 'quick "lazy dog"' } }, // mixed positive word + phrase
		{ $text: { $search: '-quick -"lazy dog"' } }, // all-negated mixed word + phrase

		// mixed pos+neg word, full implicit/explicit cross-product of both sensitivity flags
		{ $text: { $search: 'cafe -zebra' } }, // implicit default (both)
		{ $text: { $search: 'cafe -zebra', $caseSensitive: true } },
		{ $text: { $search: 'cafe -zebra', $caseSensitive: false } },
		{ $text: { $search: 'cafe -zebra', $diacriticSensitive: true } },
		{ $text: { $search: 'cafe -zebra', $diacriticSensitive: false } },
		{ $text: { $search: 'cafe -zebra', $caseSensitive: true, $diacriticSensitive: true } },
		{ $text: { $search: 'cafe -zebra', $caseSensitive: true, $diacriticSensitive: false } },
		{ $text: { $search: 'cafe -zebra', $caseSensitive: false, $diacriticSensitive: true } },
		{ $text: { $search: 'cafe -zebra', $caseSensitive: false, $diacriticSensitive: false } },

		// mixed pos+neg phrase, varying diacritics/case in the phrase content itself, each with its explicit-default sibling
		{ $text: { $search: '"naïve café" -zebra' } },
		{ $text: { $search: '"naive cafe" -zebra' } }, // no diacritics in phrase, implicit default insensitive
		{ $text: { $search: '"naive cafe" -zebra', $diacriticSensitive: false } }, // explicit default — should still match
		{ $text: { $search: '"naive cafe" -zebra', $diacriticSensitive: true } }, // should not match, diacritics differ
		{ $text: { $search: '"NAIVE CAFE" -zebra' } }, // implicit default — case-insensitive, should match
		{ $text: { $search: '"NAIVE CAFE" -zebra', $caseSensitive: false } }, // explicit default — should still match
		{ $text: { $search: '"NAIVE CAFE" -zebra', $caseSensitive: true } }, // should not match, case differs

		// tokenization gotchas
		{ $text: { $search: 'state-of-the-art' } },
		{ $text: { $search: 'art' } }, // is the compound split into sub-words?
		{ $text: { $search: "don't" } },
		{ $text: { $search: 'room101' } },

		// field-scoping contrast
		{ $text: { $search: 'unindexedonlyterm' } }, // term exists only in doc 31's unindexed `secret` field

		// --- Set D: validation / combination ---
		{ $and: [{ $text: { $search: 'quick' } }, { $text: { $search: 'fox' } }] },
		{ $or: [{ $text: { $search: 'quick' } }, { $text: { $search: 'zebra' } }] },
		{ $nor: [{ $text: { $search: 'quick' } }] },

		// --- malformed $search input ---
		{ $text: { $search: '' } },
		{ $text: { $search: '   ' } },
		{ $text: { $search: '-' } },
		{ $text: { $search: '"unterminated' } },
		{ $text: { $search: 123 } },
	],
	collection: {
		indices: [{ content: 'text' }],
		records,
	},
}
