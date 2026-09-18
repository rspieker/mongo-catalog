import type { Catalog, MongoDocument } from '../../catalog'

// $near/$nearSphere completeness matrix — built from monger's own
// complete-operator taxonomy for these two operators (2026-09-18).
// Ground truth previously existed for: valid GeoJSON Point $geometry,
// valid legacy array, a handful of malformed $geometry shapes (wrong type
// limited to Polygon/MultiPoint, wrong length, plain string), and
// $minDistance/$maxDistance presence combinations — all against the
// "correct" field for the form used (GeoJSON on `point`/2dsphere, legacy
// on `legacyPoint`/2d). What was missing, deliberately covered here:
//
//   - every RFC 7946 GeoJSON type as the $geometry argument (not just
//     Point/Polygon/MultiPoint), including the wrapper types
//     (GeometryCollection/Feature/FeatureCollection) which monger's
//     `isPoint()` guard has never been exercised against
//   - the legacy *object* form ({x, y}), which monger implements
//     (`isLegacyPointObject`) and unit-tests internally, but has zero
//     MongoDB ground truth
//   - every argument variant fired at every field regardless of whether
//     the pairing "makes sense" (GeoJSON argument at a 2d-indexed field,
//     legacy argument at a 2dsphere-indexed field, either at a field
//     indexed for a non-Point geometry, either at no index at all) — this
//     is the "mismatched pairing" and "no index" taxonomy rows, folded
//     into the same sweep rather than hand-picked cases
//   - malformed-shape sub-variants (length 0/3/4+, NaN/Infinity,
//     mixed-type elements, nested arrays, out-of-range coordinates,
//     missing/non-string `type`, extra unknown keys)
//   - $minDistance/$maxDistance edge values (negative, zero, non-numeric,
//     min > max)
//   - a literal `null` argument (monger is confirmed, by direct execution,
//     to crash with an uncaught native TypeError on this — see
//     plans/error-codes.md-adjacent session notes — this collects what
//     real MongoDB actually says so the fix can match it, not guess)
//   - $minDistance/$maxDistance given standalone, without $near/$nearSphere
//     present (probes the known Compiler.ts sibling-key filter bug,
//     documented in monger's docs/todo.md)
//
// Kept as a separate catalog from geo.ts/geo-antipodal.ts for the same
// reason geo-antipodal.ts is separate: iterable without invalidating
// already-collected results elsewhere. This file is intentionally large —
// it is a deliberate full cross, not a curated sample; a repeated
// assertion is preferred over a gap (same philosophy as type-matrix.ts).

type Point = { type: 'Point'; coordinates: [number, number] }
type LineString = { type: 'LineString'; coordinates: Array<[number, number]> }
type Polygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }

type GeoNearMatrixDocument = MongoDocument<{
	_id: number
	name: string
	point: Point
	line: LineString
	polygon: Polygon
	legacyPoint: [number, number]
	// deliberately absent from `indices` below — probes $near/$nearSphere's
	// "no geospatial index available" error path
	unindexedPoint: Point
}>

const REF_LNG = 5.9
const REF_LAT = 52.0

function doc(id: number, offset: number): GeoNearMatrixDocument {
	const lng = REF_LNG + offset
	const lat = REF_LAT + offset

	return {
		_id: id,
		name: `Record ${id}`,
		point: { type: 'Point', coordinates: [lng, lat] },
		line: {
			type: 'LineString',
			coordinates: [
				[lng, lat],
				[lng + 0.01, lat + 0.01],
			],
		},
		polygon: {
			type: 'Polygon',
			coordinates: [
				[
					[lng - 0.01, lat - 0.01],
					[lng + 0.01, lat - 0.01],
					[lng + 0.01, lat + 0.01],
					[lng - 0.01, lat + 0.01],
					[lng - 0.01, lat - 0.01],
				],
			],
		},
		legacyPoint: [lng, lat],
		unindexedPoint: { type: 'Point', coordinates: [lng, lat] },
	}
}

const records: Array<GeoNearMatrixDocument> = Array.from({ length: 8 }, (_, i) =>
	doc(i, i * 0.005)
)

// ---- every RFC 7946 GeoJSON geometry type, as a well-formed instance ----

const point: Point = { type: 'Point', coordinates: [REF_LNG, REF_LAT] }
const multiPoint = {
	type: 'MultiPoint' as const,
	coordinates: [
		[REF_LNG, REF_LAT],
		[REF_LNG + 0.01, REF_LAT + 0.01],
	],
}
const lineString: LineString = {
	type: 'LineString',
	coordinates: [
		[REF_LNG, REF_LAT],
		[REF_LNG + 0.01, REF_LAT + 0.01],
	],
}
const multiLineString = {
	type: 'MultiLineString' as const,
	coordinates: [
		[
			[REF_LNG, REF_LAT],
			[REF_LNG + 0.01, REF_LAT + 0.01],
		],
		[
			[REF_LNG + 0.02, REF_LAT],
			[REF_LNG + 0.03, REF_LAT + 0.01],
		],
	],
}
const polygon: Polygon = {
	type: 'Polygon',
	coordinates: [
		[
			[REF_LNG - 0.01, REF_LAT - 0.01],
			[REF_LNG + 0.01, REF_LAT - 0.01],
			[REF_LNG + 0.01, REF_LAT + 0.01],
			[REF_LNG - 0.01, REF_LAT + 0.01],
			[REF_LNG - 0.01, REF_LAT - 0.01],
		],
	],
}
const multiPolygon = {
	type: 'MultiPolygon' as const,
	coordinates: [
		[
			[
				[REF_LNG - 0.03, REF_LAT - 0.03],
				[REF_LNG - 0.02, REF_LAT - 0.03],
				[REF_LNG - 0.02, REF_LAT - 0.02],
				[REF_LNG - 0.03, REF_LAT - 0.02],
				[REF_LNG - 0.03, REF_LAT - 0.03],
			],
		],
		[
			[
				[REF_LNG + 0.02, REF_LAT + 0.02],
				[REF_LNG + 0.03, REF_LAT + 0.02],
				[REF_LNG + 0.03, REF_LAT + 0.03],
				[REF_LNG + 0.02, REF_LAT + 0.03],
				[REF_LNG + 0.02, REF_LAT + 0.02],
			],
		],
	],
}
const geometryCollection = {
	type: 'GeometryCollection' as const,
	geometries: [point, lineString],
}
const feature = {
	type: 'Feature' as const,
	geometry: point,
	properties: {},
}
const featureCollection = {
	type: 'FeatureCollection' as const,
	features: [feature],
}

const geoJSONVariants: Array<[string, unknown]> = [
	['Point', point],
	['MultiPoint', multiPoint],
	['LineString', lineString],
	['MultiLineString', multiLineString],
	['Polygon', polygon],
	['MultiPolygon', multiPolygon],
	['GeometryCollection', geometryCollection],
	['Feature', feature],
	['FeatureCollection', featureCollection],
]

const legacyArray: [number, number] = [REF_LNG, REF_LAT]
const legacyObject = { x: REF_LNG, y: REF_LAT }

const fields = [
	'point',
	'line',
	'polygon',
	'legacyPoint',
	'unindexedPoint',
] as const
const operators = ['$near', '$nearSphere'] as const

// ---- Matrix A: every argument variant × every field × both operators ----
// (11 argument shapes) x (5 fields) x (2 operators) = 110 operations
const typeFieldMatrix = operators.flatMap((op) =>
	fields.flatMap((field) => [
		...geoJSONVariants.map(([, geometry]) => ({
			[field]: { [op]: { $geometry: geometry } },
		})),
		{ [field]: { [op]: legacyArray } },
		{ [field]: { [op]: legacyObject } },
	])
)

// ---- Matrix B: malformed $geometry shapes ----
// (12 shapes) x (2 operators) x (2 fields) = 48 operations
const malformedGeometryShapes: Array<[string, unknown]> = [
	['empty array', []],
	['3-element array (altitude)', [REF_LNG, REF_LAT, 10]],
	['4-element array', [REF_LNG, REF_LAT, 10, 99]],
	['NaN longitude', [NaN, REF_LAT]],
	['Infinity latitude', [REF_LNG, Infinity]],
	['-Infinity longitude', [-Infinity, REF_LAT]],
	['mixed-type elements', [REF_LNG, 'not-a-number']],
	['nested-array elements', [[REF_LNG, REF_LAT]]],
	['out-of-bounds coordinates', [200, 100]],
	['missing type key', { coordinates: [REF_LNG, REF_LAT] }],
	['non-string type', { type: 5, coordinates: [REF_LNG, REF_LAT] }],
	[
		'extra unknown key',
		{ type: 'Point', coordinates: [REF_LNG, REF_LAT], extra: 'nope' },
	],
]

const malformedGeometryOperations = operators.flatMap((op) =>
	malformedGeometryShapes.flatMap(([, shape]) => [
		{ point: { [op]: { $geometry: shape } } },
		{ legacyPoint: { [op]: { $geometry: shape } } },
	])
)

// ---- Matrix C: malformed bare-legacy shapes ----
// (5 shapes) x (2 operators) x (2 fields) = 20 operations
const malformedLegacyShapes: Array<[string, unknown]> = [
	['empty array', []],
	['NaN element', [NaN, REF_LAT]],
	['nested-array elements', [[REF_LNG, REF_LAT]]],
	['single-key object', { x: REF_LNG }],
	['three-key object', { x: REF_LNG, y: REF_LAT, z: 10 }],
]

const malformedLegacyOperations = operators.flatMap((op) =>
	malformedLegacyShapes.flatMap(([, shape]) => [
		{ point: { [op]: shape } },
		{ legacyPoint: { [op]: shape } },
	])
)

// ---- Matrix D: $minDistance/$maxDistance edge values ----
// (5 cases) x (2 operators) x (2 fields) = 20 operations
const distanceEdgeCases: Array<[string, Record<string, unknown>]> = [
	['negative $maxDistance', { $maxDistance: -100 }],
	['zero $maxDistance', { $maxDistance: 0 }],
	['non-numeric $maxDistance', { $maxDistance: 'far' }],
	['negative $minDistance', { $minDistance: -100 }],
	['$minDistance > $maxDistance', { $minDistance: 1000, $maxDistance: 100 }],
]

const distanceEdgeOperations = operators.flatMap((op) =>
	distanceEdgeCases.flatMap(([, extra]) => [
		{ point: { [op]: { $geometry: point, ...extra } } },
		{ legacyPoint: { [op]: legacyArray, ...extra } },
	])
)

// ---- Matrix E: literal null argument ----
// monger confirmed (by direct execution, 2026-09-18) to crash with an
// uncaught native TypeError here rather than its own Error — this collects
// what real MongoDB says so the fix matches ground truth, not a guess.
// (2 operators) x (2 fields) = 4 operations
const nullArgumentOperations = operators.flatMap((op) => [
	{ point: { [op]: null } },
	{ legacyPoint: { [op]: null } },
])

// ---- Matrix F: $minDistance/$maxDistance given standalone ----
// Probes the Compiler.ts sibling-key filter bug (docs/todo.md,
// "$near"/$nearSphere's sibling $minDistance/$maxDistance") — the filter
// condition is always-true regardless of whether $near/$nearSphere is
// actually present, so monger currently no-ops these unconditionally.
// 2 operations
const standaloneSiblingKeyOperations = [
	{ point: { $minDistance: 100 } },
	{ point: { $maxDistance: 100 } },
]

export const geoNearMatrix: Catalog<GeoNearMatrixDocument> = {
	description: '$near/$nearSphere geometry-type x field x malformed-shape matrix',
	operations: [
		...typeFieldMatrix,
		...malformedGeometryOperations,
		...malformedLegacyOperations,
		...distanceEdgeOperations,
		...nullArgumentOperations,
		...standaloneSiblingKeyOperations,
	],
	collection: {
		indices: [
			{ point: '2dsphere' },
			{ line: '2dsphere' },
			{ polygon: '2dsphere' },
			{ legacyPoint: '2d' },
		],
		records,
	},
}
