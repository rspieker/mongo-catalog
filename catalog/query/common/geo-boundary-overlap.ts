import type { Catalog, MongoDocument } from '../../catalog'

// Taxonomy for three related-but-distinct "exactly on the boundary"
// phenomena found while investigating monger's cluster #5/#7 mismatches
// and filing @konfirm/geojson issues #29/#30/#31:
//
//   1. LineString x LineString collinear overlap — does $geoIntersects
//      register an intersection between two segments that lie on the same
//      line, and if so under what condition (established via docker probing
//      to *not* be plain interval overlap: full containment in either
//      direction is excluded, everything else that shares a boundary point
//      is included).
//   2. LineString x Polygon-edge collinear overlap — same question, but
//      against a ring's edge specifically. Confirmed empirically distinct
//      from (1): the "exact full edge" case doesn't match here, unlike the
//      "identical segment" case in (1).
//   3. Legacy $polygon (2d index) boundary handling — confirmed distinct
//      from both of the above: excludes points exactly on an edge, but
//      includes points exactly at a vertex.
//
// A single reference diagonal (the line from [0,0] to [10,10]) is reused
// as both the LineString query in (1) and the Polygon's own edge in (2),
// so the same set of candidate lines exercises both dimensions without
// needing two separate document sets.
//
// Kept as its own catalog (not merged into geo-within-intersects-matrix.ts)
// per this project's established precedent (geo-antipodal.ts etc.) — new
// operations appended to an existing file are safe (don't shift already-
// collected indices), but these need their own documents and index
// declarations, which isn't safe to fold into a shared collection.

type Point = { type: 'Point'; coordinates: [number, number] }
type LineString = { type: 'LineString'; coordinates: Array<[number, number]> }
type Polygon = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }

type GeoBoundaryOverlapDocument = MongoDocument<{
	_id: number
	name: string
	line: LineString
	point: Point
	legacyPoint: [number, number]
}>

// The reference diagonal, used as both the LineString query (dimension 1)
// and the Polygon's own hypotenuse edge (dimension 2).
const REF_START: [number, number] = [0, 0]
const REF_END: [number, number] = [10, 10]
const referenceLine: LineString = { type: 'LineString', coordinates: [REF_START, REF_END] }
const referenceTriangle: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }

// Placeholder point/legacyPoint for the line-scenario documents — not what
// dimension 1/2's operations query against, just needs to satisfy the
// document shape. Set to the line's own start, harmless either way.
function lineDoc(id: number, name: string, coordinates: [[number, number], [number, number]]): GeoBoundaryOverlapDocument {
	return {
		_id: id,
		name,
		line: { type: 'LineString', coordinates },
		point: { type: 'Point', coordinates: coordinates[0] },
		legacyPoint: coordinates[0],
	}
}

// Placeholder line for the point-scenario documents — not what dimension
// 2/3's point operations query against, just needs to satisfy the shape.
function pointDoc(id: number, name: string, coordinates: [number, number]): GeoBoundaryOverlapDocument {
	return {
		_id: id,
		name,
		line: { type: 'LineString', coordinates: [coordinates, coordinates] },
		point: { type: 'Point', coordinates },
		legacyPoint: coordinates,
	}
}

const records: Array<GeoBoundaryOverlapDocument> = [
	// Dimension 1 & 2: LineString scenarios, relative to the reference
	// diagonal [0,0]-[10,10] (both as a standalone LineString query and as
	// the triangle's hypotenuse edge).
	lineDoc(0, 'partial overlap straddling the start vertex', [[-2, -2], [5, 5]]),
	lineDoc(1, 'partial overlap straddling the end vertex', [[5, 5], [12, 12]]),
	lineDoc(2, 'full containment, candidate strictly inside', [[2, 2], [8, 8]]),
	lineDoc(3, 'full containment, candidate strictly swallows', [[-2, -2], [12, 12]]),
	lineDoc(4, 'identical segment', [REF_START, REF_END]),
	lineDoc(5, 'identical segment, reversed direction', [REF_END, REF_START]),
	lineDoc(6, 'single-vertex touch, extending away', [[0, 0], [-5, -5]]),
	lineDoc(7, 'disjoint, no overlap at all', [[12, 12], [15, 15]]),
	lineDoc(8, 'transversal crossing, non-collinear', [[0, 10], [10, 0]]),
	lineDoc(9, 'parallel, non-collinear, never touching', [[0, 1], [10, 11]]),
	lineDoc(10, 'from the start vertex, partway along', [[0, 0], [5, 5]]),
	lineDoc(11, 'from the end vertex, partway along', [[10, 10], [5, 5]]),
	// Dimension 2 only: a genuine interior crossing, not along the edge at
	// all — sanity baseline for the Polygon-vs-LineString operation.
	lineDoc(12, 'genuine interior crossing, not touching any edge', [[8, 1], [8, 7]]),

	// Dimension 2 (point contrast) & 3 (legacy vs modern boundary):
	pointDoc(13, 'point exactly mid-edge', [5, 5]),
	pointDoc(14, 'point exactly at the start vertex', [0, 0]),
	pointDoc(15, 'point exactly at the end vertex', [10, 10]),
	pointDoc(16, 'point exactly at the third vertex', [10, 0]),
	pointDoc(17, 'point clearly interior', [8, 3]),
	pointDoc(18, 'point clearly exterior', [20, 20]),
]

export const geoBoundaryOverlap: Catalog<GeoBoundaryOverlapDocument> = {
	description: 'LineString x LineString / LineString x Polygon-edge collinear overlap, and legacy $polygon boundary handling — taxonomy for konfirm/geojson#29/#30/#31 follow-up',
	operations: [
		// Dimension 1: LineString x LineString
		{ line: { $geoIntersects: { $geometry: referenceLine } } },
		// Dimension 2: LineString x Polygon-edge (same diagonal, as the
		// triangle's own hypotenuse)
		{ line: { $geoIntersects: { $geometry: referenceTriangle } } },
		// Dimension 2 point contrast & 3 modern-path: point vs the same
		// triangle via the modern $geometry form
		{ point: { $geoWithin: { $geometry: referenceTriangle } } },
		// Dimension 3: legacy $polygon vs the same triangle, 2d index
		{ legacyPoint: { $geoWithin: { $polygon: referenceTriangle.coordinates[0] } } },
	],
	collection: {
		indices: [
			{ line: '2dsphere' },
			{ point: '2dsphere' },
			{ legacyPoint: '2d' },
		],
		records,
	},
}
