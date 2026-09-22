import type { Catalog, MongoDocument } from '../../catalog'

type Point = { type: 'Point'; coordinates: [number, number] }
type LineString = { type: 'LineString'; coordinates: Array<[number, number]> }
type Polygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }

type GeoWithinIntersectsDocument = MongoDocument<{
	_id: number
	name: string
	point: Point
	line: LineString
	polygon: Polygon
	legacyPoint: [number, number]
	// deliberately absent from `indices` below — probes the "no index"
	// question for $geoWithin/$geoIntersects, which (unlike $near/
	// $nearSphere) don't get an index-exclusion carve-out: real MongoDB
	// can run both without an index, so this is genuinely in scope.
	unindexedPoint: Point
}>

const REF_LNG = 5.9
const REF_LAT = 52.0

function square(cx: number, cy: number, half: number): Array<[number, number]> {
	return [
		[cx - half, cy - half],
		[cx + half, cy - half],
		[cx + half, cy + half],
		[cx - half, cy + half],
		[cx - half, cy - half],
	]
}

function doc(id: number, lng: number, lat: number): GeoWithinIntersectsDocument {
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
		polygon: { type: 'Polygon', coordinates: [square(lng, lat, 0.01)] },
		legacyPoint: [lng, lat],
		unindexedPoint: { type: 'Point', coordinates: [lng, lat] },
	}
}

// Named, hand-picked positions rather than a generated sequence — several
// operations below specifically depend on a document being inside/outside
// a particular ring or hole, not on generic variation.
const insideOuterOutsideHole: [number, number] = [REF_LNG + 1, REF_LAT + 1]
const insideHole: [number, number] = [REF_LNG + 5, REF_LAT + 5]
const outsideOuter: [number, number] = [REF_LNG + 20, REF_LAT + 20]
const insideMultiPolyA: [number, number] = [REF_LNG + 1, REF_LAT + 1]
const insideMultiPolyB: [number, number] = [REF_LNG + 11, REF_LAT + 11]
const insideNeitherMultiPoly: [number, number] = [REF_LNG + 5, REF_LAT + 20]

const records: Array<GeoWithinIntersectsDocument> = [
	doc(0, REF_LNG, REF_LAT),
	doc(1, ...insideOuterOutsideHole),
	doc(2, ...insideHole),
	doc(3, ...outsideOuter),
	doc(4, ...insideMultiPolyB),
	doc(5, ...insideNeitherMultiPoly),
	doc(6, REF_LNG + 0.005, REF_LAT + 0.005),
	doc(7, REF_LNG - 0.005, REF_LAT - 0.005),
]

// ---- Group 1: Polygon/Ring malformed shapes ($geoWithin $geometry, $geoIntersects $geometry, legacy $polygon) ----

const outerRing = square(REF_LNG + 5, REF_LAT + 5, 5) // covers insideOuterOutsideHole and insideHole, not outsideOuter
const holeRing = square(REF_LNG + 5, REF_LAT + 5, 2) // covers insideHole only

const polygonWithHole: Polygon = { type: 'Polygon', coordinates: [outerRing, holeRing] }

const multiPolygon = {
	type: 'MultiPolygon' as const,
	coordinates: [
		[square(REF_LNG + 1, REF_LAT + 1, 1)], // covers insideMultiPolyA
		[square(REF_LNG + 11, REF_LAT + 11, 1)], // covers insideMultiPolyB
	],
}

const malformedRingShapes: Array<[string, unknown]> = [
	['1-point ring', [[REF_LNG, REF_LAT]]],
	['2-point ring', [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT]]],
	['3-point ring (below the 4-point closed-ring minimum)', [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT], [REF_LNG + 1, REF_LAT + 1]]],
	['unclosed ring (first != last)', [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT], [REF_LNG + 1, REF_LAT + 1], [REF_LNG, REF_LAT + 1]]],
	['duplicate consecutive points', [[REF_LNG, REF_LAT], [REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT], [REF_LNG + 1, REF_LAT + 1], [REF_LNG, REF_LAT]]],
]

const polygonRingOperations = [
	// interior ring (hole) — positive case, confirms the field-point-in-hole
	// exclusion the library already implements (PolygonPoint's `interior.every`)
	{ point: { $geoWithin: { $geometry: polygonWithHole } } },
	{ point: { $geoIntersects: { $geometry: polygonWithHole } } },

	// MultiPolygon — positive case, zero prior fixture coverage anywhere
	{ point: { $geoWithin: { $geometry: multiPolygon } } },
	{ point: { $geoIntersects: { $geometry: multiPolygon } } },
	// MultiPolygon is confirmed (Within.ts source) structurally excluded from
	// strict-winding/hemisphere-invert handling — a hemisphere-exceeding
	// component probes whether that's actually correct per real MongoDB, or
	// an untested asymmetry
	{
		point: {
			$geoWithin: {
				$geometry: {
					type: 'MultiPolygon',
					coordinates: [
						[[[-170, 0], [-160, 0], [-150, 0], [-170, 80], [-170, 0]]],
						[square(REF_LNG + 1, REF_LAT + 1, 1)],
					],
				},
			},
		},
	},

	// malformed rings, both as $geoWithin/$geoIntersects $geometry and as
	// legacy $polygon (which has its own, separately-coded validation)
	...malformedRingShapes.flatMap(([, ring]) => [
		{ point: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [ring] } } } },
		{ point: { $geoIntersects: { $geometry: { type: 'Polygon', coordinates: [ring] } } } },
		{ legacyPoint: { $geoWithin: { $polygon: ring } } },
	]),

	// malformed/garbage crs, extra unknown top-level keys
	{ point: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [square(REF_LNG, REF_LAT, 1)], crs: 'not-a-real-crs' } } } },
	{ point: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [square(REF_LNG, REF_LAT, 1)], crs: { type: 'name', properties: { name: 'not-a-real-crs' } } } } } },
	{ point: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [square(REF_LNG, REF_LAT, 1)], extra: 'nope' } } } },
]

// ---- Group 2: $box malformed/degenerate/inverted shapes ----

const malformedBoxShapes: Array<[string, unknown]> = [
	['absent (empty array)', []],
	['1-element array', [[REF_LNG, REF_LAT]]],
	['3-element array (extra ignored per monger; confirm real MongoDB agrees)', [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT + 1], [REF_LNG + 2, REF_LAT + 2]]],
	['malformed corner (not a point)', [[REF_LNG], [REF_LNG + 1, REF_LAT + 1]]],
	['malformed corner (non-numeric)', [[REF_LNG, 'not-a-number'], [REF_LNG + 1, REF_LAT + 1]]],
]

const boxOperations = [
	...malformedBoxShapes.flatMap(([, $box]) => [{ legacyPoint: { $geoWithin: { $box } } }]),
	// degenerate: zero-area box (same corner twice)
	{ legacyPoint: { $geoWithin: { $box: [[REF_LNG, REF_LAT], [REF_LNG, REF_LAT]] } } },
	// inverted: min>max on one axis — monger auto-normalizes (legacyToGeoJSON
	// sorts each axis independently); confirms whether real MongoDB does too
	{ legacyPoint: { $geoWithin: { $box: [[REF_LNG + 1, REF_LAT], [REF_LNG, REF_LAT + 1]] } } },
	{ legacyPoint: { $geoWithin: { $box: [[REF_LNG, REF_LAT + 1], [REF_LNG + 1, REF_LAT]] } } },
	{ legacyPoint: { $geoWithin: { $box: [[REF_LNG + 1, REF_LAT + 1], [REF_LNG, REF_LAT]] } } },
]

// ---- Group 3: $center/$centerSphere radius as a string ----

const radiusStringOperations = [
	{ legacyPoint: { $geoWithin: { $center: [[REF_LNG, REF_LAT], '1000'] } } },
	{ legacyPoint: { $geoWithin: { $centerSphere: [[REF_LNG, REF_LAT], '0.01'] } } },
]

// ---- Group 4: mismatched field/operator pairing ----

const mismatchedPairingOperations = [
	// $box/$polygon/$center confirmed (Within.ts source) to only ever match
	// a legacy-shaped document field, never GeoJSON — probes whether real
	// MongoDB's actual behavior matches that restriction
	{ point: { $geoWithin: { $box: [[REF_LNG, REF_LAT], [REF_LNG + 10, REF_LAT + 10]] } } },
	{ point: { $geoWithin: { $polygon: square(REF_LNG + 5, REF_LAT + 5, 5) } } },
	{ point: { $geoWithin: { $center: [[REF_LNG + 5, REF_LAT + 5], 10] } } },
	// $centerSphere and $geometry are confirmed to accept either shape —
	// this should already work; confirms rather than assumes
	{ point: { $geoWithin: { $centerSphere: [[REF_LNG + 5, REF_LAT + 5], 0.5] } } },
	{ legacyPoint: { $geoWithin: { $geometry: polygonWithHole } } },
	// $geoIntersects confirmed (Geospatial.ts source) to only ever check
	// isGeoJSON(input) — never accepts a legacy-shaped field at all
	{ legacyPoint: { $geoIntersects: { $geometry: polygonWithHole } } },

	// no index at all — $geoWithin/$geoIntersects don't get the $near/
	// $nearSphere index-exclusion; genuinely in scope here
	{ unindexedPoint: { $geoWithin: { $geometry: polygonWithHole } } },
	{ unindexedPoint: { $geoWithin: { $box: [[REF_LNG, REF_LAT], [REF_LNG + 10, REF_LAT + 10]] } } },
	{ unindexedPoint: { $geoIntersects: { $geometry: polygonWithHole } } },
]

// ---- Group 5: $geoIntersects type x type matrix ----
// full 6 (query geometry) x 3 (field) grid, redundant with a few
// already-covered cells by design (repeated assertion preferred over a gap)

const point: Point = { type: 'Point', coordinates: [REF_LNG, REF_LAT] }
const multiPoint = {
	type: 'MultiPoint' as const,
	coordinates: [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT + 1]],
}
const lineString: LineString = {
	type: 'LineString',
	coordinates: [[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT + 1]],
}
const multiLineString = {
	type: 'MultiLineString' as const,
	coordinates: [
		[[REF_LNG, REF_LAT], [REF_LNG + 1, REF_LAT + 1]],
		[[REF_LNG + 2, REF_LAT], [REF_LNG + 3, REF_LAT + 1]],
	],
}
const polygon: Polygon = { type: 'Polygon', coordinates: [square(REF_LNG, REF_LAT, 1)] }

const queryGeometries: Array<[string, unknown]> = [
	['Point', point],
	['MultiPoint', multiPoint],
	['LineString', lineString],
	['MultiLineString', multiLineString],
	['Polygon', polygon],
	['MultiPolygon', multiPolygon],
]
const targetFields = ['point', 'line', 'polygon'] as const

const typeMatrixOperations = targetFields.flatMap((field) =>
	queryGeometries.map(([, $geometry]) => ({
		[field]: { $geoIntersects: { $geometry } },
	})),
)

export const geoWithinIntersectsMatrix: Catalog<GeoWithinIntersectsDocument> = {
	description: '$geoWithin/$geoIntersects polygon/ring/box/center taxonomy + $geoIntersects type x type matrix',
	operations: [
		...polygonRingOperations,
		...boxOperations,
		...radiusStringOperations,
		...mismatchedPairingOperations,
		...typeMatrixOperations,
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
