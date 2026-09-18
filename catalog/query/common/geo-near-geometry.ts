import type { Catalog, MongoDocument } from '../../catalog'

// $near/$nearSphere's `$geometry` argument-parsing taxonomy — every ad-hoc
// docker probe from the 2026-09-18/19 investigation session that resolved
// how monger's Geospatial/NearGeometry.ts arrives at MongoDB's exact error
// text, turned into durable catalog entries instead of living only in
// scratch scripts. See plans/geospatial-completeness.md and
// source/Domain/Filter/Operator/Geospatial/NearGeometry.ts (monger) for
// the full writeup of what this taxonomy explains.
//
// Kept as its own catalog, not merged into geoNearMatrix.ts, for the same
// reason geo-antipodal.ts stays separate from geo.ts: geoNearMatrix.ts
// already has 204 collected operations matched to ground truth by array
// index — inserting into the middle would shift every later index and
// silently break that positional match. Appending here instead.
//
// $nearSphere symmetry was spot-checked directly (a handful of cases
// confirmed identical to $near this session) rather than independently
// re-derived per case — every case below is still applied to both
// operators, since collecting it costs nothing extra and matches
// geoNearMatrix's own "repeated assertion preferred over a gap" precedent.

type Point = { type: 'Point'; coordinates: [number, number] }

type GeoNearGeometryDocument = MongoDocument<{
	_id: number
	name: string
	point: Point
	legacyPoint: [number, number]
}>

const REF_LNG = 5.9
const REF_LAT = 52.0

function doc(id: number, offset: number): GeoNearGeometryDocument {
	const lng = REF_LNG + offset
	const lat = REF_LAT + offset

	return {
		_id: id,
		name: `Record ${id}`,
		point: { type: 'Point', coordinates: [lng, lat] },
		legacyPoint: [lng, lat],
	}
}

const records: Array<GeoNearGeometryDocument> = Array.from({ length: 4 }, (_, i) =>
	doc(i, i * 0.005)
)

const operators = ['$near', '$nearSphere'] as const

// ---- Group 1: `coordinates`-key fallback (no `type`), shape variants ----
const coordinatesFallbackShapes: Array<[string, unknown]> = [
	['LineString-shaped (nested array)', [[REF_LNG, REF_LAT], [REF_LNG + 0.01, REF_LAT + 0.01]]],
	['Polygon-shaped (doubly-nested array)', [[[REF_LNG, REF_LAT], [REF_LNG + 0.01, REF_LAT], [REF_LNG + 0.01, REF_LAT + 0.01], [REF_LNG, REF_LAT]]]],
	['length-1 array', [REF_LNG]],
	['length-3 array (altitude) — expected valid', [REF_LNG, REF_LAT, 10]],
	['object form {x, y} — expected valid', { x: REF_LNG, y: REF_LAT }],
	['null', null],
]
const coordinatesFallbackOperations = operators.flatMap((op) =>
	coordinatesFallbackShapes.flatMap(([, coordinates]) => [
		{ point: { [op]: { $geometry: { coordinates } } } },
	])
)

// ---- Group 2: object with neither `type` nor `coordinates` key ----
const noRecognizedKeyShapes: Array<[string, unknown]> = [
	['two numeric keys {x, y}', { x: REF_LNG, y: REF_LAT }],
	['two numeric keys {lon, lat}', { lon: REF_LNG, lat: REF_LAT }],
	['one array-valued key, wrong name', { notCoordinates: [REF_LNG, REF_LAT] }],
	['completely empty object', {}],
	['one numeric key only', { x: REF_LNG }],
]
const noRecognizedKeyOperations = operators.flatMap((op) =>
	noRecognizedKeyShapes.flatMap(([, $geometry]) => [{ point: { [op]: { $geometry } } }])
)

// ---- Group 3: `type` present, non-'Point' string/non-string variants ----
const wrongTypeShapes: Array<[string, unknown]> = [
	["type:'Point' alone, no coordinates key", { type: 'Point' }],
	["type:'Point', coordinates: null", { type: 'Point', coordinates: null }],
	["type:'Point', coordinates as object form {x,y} — expected valid", { type: 'Point', coordinates: { x: REF_LNG, y: REF_LAT } }],
	['type: null', { type: null, coordinates: [REF_LNG, REF_LAT] }],
	["type: '' (empty string)", { type: '', coordinates: [REF_LNG, REF_LAT] }],
	['type: true (boolean)', { type: true, coordinates: [REF_LNG, REF_LAT] }],
	["type: ['Point'] (array)", { type: ['Point'], coordinates: [REF_LNG, REF_LAT] }],
	["type: 'point' (lowercase)", { type: 'point', coordinates: [REF_LNG, REF_LAT] }],
	["type: 'LineString' (valid GeoJSON type, wrong for near)", { type: 'LineString', coordinates: [REF_LNG, REF_LAT] }],
]
const wrongTypeOperations = operators.flatMap((op) =>
	wrongTypeShapes.flatMap(([, $geometry]) => [{ point: { [op]: { $geometry } } }])
)

// ---- Group 4: `type` present as a NUMBER (legacy-object-fallback quirk) ----
const numericTypeShapes: Array<[string, unknown]> = [
	['type: 0', { type: 0, coordinates: [REF_LNG, REF_LAT] }],
	['type: -1', { type: -1, coordinates: [REF_LNG, REF_LAT] }],
	['type: 1.5 (float)', { type: 1.5, coordinates: [REF_LNG, REF_LAT] }],
	['type: 5, coordinates a scalar (both fields numeric)', { type: 5, coordinates: REF_LAT }],
	['type: 5, coordinates length-1 array', { type: 5, coordinates: [REF_LNG] }],
	['type: 5, no coordinates key at all', { type: 5 }],
	['type: 5, unrelated numeric extra key, no coordinates', { type: 5, extra: 6 }],
]
const numericTypeOperations = operators.flatMap((op) =>
	numericTypeShapes.flatMap(([, $geometry]) => [{ point: { [op]: { $geometry } } }])
)

// ---- Group 5: bare array/object edge shapes, $geometry itself (no wrapper) ----
const bareShapes: Array<[string, unknown]> = [
	['bare array, length 1', [REF_LNG]],
	['bare object, one numeric key only', { x: REF_LNG }],
]
const bareOperations = operators.flatMap((op) =>
	bareShapes.flatMap(([, $geometry]) => [{ point: { [op]: { $geometry } } }])
)

// ---- Group 6: coordinates-fallback success interacting with index mismatch ----
// A valid legacy-point resolved via the no-`type` fallback, fired at the
// `legacyPoint` (2d-indexed) field instead of `point` (2dsphere) — probes
// whether the fallback's *result* still goes through the same GeoJSON-form
// index requirement (2dsphere) as an explicit `$geometry`, i.e. whether the
// index-mismatch check happens before or independent of which parse path
// produced the point. Directly informs monger's D-exclusion boundary
// (plans/geospatial-completeness.md) — not something monger will act on,
// but worth having as ground truth rather than an assumption.
const fallbackIndexMismatchOperations = operators.map((op) => ({
	legacyPoint: { [op]: { $geometry: { coordinates: [REF_LNG, REF_LAT] } } },
}))

export const geoNearGeometry: Catalog<GeoNearGeometryDocument> = {
	description: "$near/$nearSphere $geometry argument-parsing taxonomy (type/coordinates key presence and shape)",
	operations: [
		...coordinatesFallbackOperations,
		...noRecognizedKeyOperations,
		...wrongTypeOperations,
		...numericTypeOperations,
		...bareOperations,
		...fallbackIndexMismatchOperations,
	],
	collection: {
		indices: [
			{ point: '2dsphere' },
			{ legacyPoint: '2d' },
		],
		records,
	},
}
