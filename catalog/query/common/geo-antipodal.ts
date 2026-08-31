import { Catalog, MongoDocument } from '../../catalog'

// Geospatial edge cases — antipodal/near-antipodal points, dateline wraparound,
// and polygon winding order at both small and hemisphere scale.
// These are hand-picked coordinates rather than generated data as the whole
// point is specific, known-tricky geometry, not variation.
//
// Kept as a separate catalog (not merged into geo.ts) so this can be
// iterated on without invalidating already-collected results for the
// broader geo catalog.

type GeoAntipodalDocument = MongoDocument<{
    _id: number
    name: string
    point: { type: 'Point'; coordinates: [number, number] }
    legacyPoint: [number, number]
}>

function doc(
    id: number,
    name: string,
    coordinates: [number, number]
): GeoAntipodalDocument {
    return {
        _id: id,
        name,
        point: { type: 'Point', coordinates },
        legacyPoint: coordinates,
    }
}

// Real-world reference triangle also used in monger's own Geospatial tests —
// collecting the same points here lets us diff monger's hand-written
// expectations against real MongoDB directly.
const ARNHEM: [number, number] = [5.909662963872819, 51.9790545929402]
const BERLIN: [number, number] = [13.377711564851495, 52.51627850716736]
const PARIS: [number, number] = [2.294496321427715, 48.858267992656096]

// A dense-vertex ring approximating a band from -60 to 60 latitude, full
// longitude range. Any single edge only spans 10 degrees of longitude, so
// none of them lean toward the poles or are snapped to the short
// great-circle arc across the antimeridian the way a naive 4-corner
// rectangle would (see NAIVE_LARGE_RING below for that failure mode).
// Covers a large majority of the globe's surface, i.e. more than a
// hemisphere, which is where GeoJSON polygon winding is documented to
// start mattering.
function parallel(
    lat: number,
    lonFrom: number,
    lonTo: number,
    step: number
): Array<[number, number]> {
    const points: Array<[number, number]> = []
    const dir = lonTo >= lonFrom ? step : -step
    for (
        let lon = lonFrom;
        dir > 0 ? lon <= lonTo : lon >= lonTo;
        lon += dir
    ) {
        points.push([lon, lat])
    }
    return points
}

const bigRingA: Array<[number, number]> = [
    ...parallel(-60, -170, 170, 10), // bottom edge, west -> east
    ...parallel(60, 170, -170, 10), // top edge, east -> west (meridian jumps at both ends)
]
bigRingA.push(bigRingA[0])
const bigRingB = [...bigRingA].reverse()

// The naive way one would write "a big rectangle": 4 corners. Because a GeoJSON
// edge between two points is the shortest of the two possible arcs, and
// 340 > 180, these edges get interpreted as a 20-degree arc the other
// way around.
const naiveLargeRing: Array<[number, number]> = [
    [-170, -80],
    [-170, 80],
    [170, 80],
    [170, -80],
    [-170, -80],
]
const naiveLargeRingReversed = [...naiveLargeRing].reverse()

// Small (sub-hemisphere) square, both windings (CW and CCW) are expected to be
// winding insensitive.
const smallCCW: Array<[number, number]> = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
]
const smallCW = [...smallCCW].reverse()

// A small polygon that crosses the antimeridian the "short way" (4 degrees).
const antimeridianSmall: Array<[number, number]> = [
    [178, -20],
    [178, -16],
    [-178, -16],
    [-178, -20],
    [178, -20],
]

export const geoAntipodal: Catalog<GeoAntipodalDocument> = {
    operations: [
        // antipodal / near-antipodal $near / $nearSphere
        // Real MongoDB (S2-based) is expected to never throw here, unlike
        // an ellipsoidal-geodesic formula (e.g. Vincenty) which can fail to
        // converge for near-antipodal inputs.
        {
            point: {
                $nearSphere: {
                    $geometry: { type: 'Point', coordinates: [0, 0] },
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: { type: 'Point', coordinates: [0, 0] },
                    $maxDistance: 20037508,
                },
            },
        },
        {
            point: {
                $near: { $geometry: { type: 'Point', coordinates: [0, 0] } },
            },
        },
        { legacyPoint: { $near: [0, 0] } },
        { legacyPoint: { $nearSphere: [0, 0] } },
        // just under / over pi radians (half the sphere) around the origin
        { legacyPoint: { $nearSphere: [0, 0], $maxDistance: 3.14159 } },
        { legacyPoint: { $nearSphere: [0, 0], $maxDistance: 3.15 } },

        // dateline wrap: 2dsphere (should wrap) vs 2d (should not)
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [-179.95, 10],
                    },
                    $maxDistance: 50000,
                },
            },
        },
        { legacyPoint: { $near: [-179.95, 10], $maxDistance: 1 } },
        { legacyPoint: { $nearSphere: [-179.95, 10], $maxDistance: 0.1 } },

        // legacy $near (raw coordinate-space Euclidean, degrees)
        // using the arnhem/berlin/paris triangle also used in monger's tests
        { legacyPoint: { $near: ARNHEM } },
        {
            legacyPoint: { $near: ARNHEM, $minDistance: 6, $maxDistance: 10 },
        },

        // legacy $nearSphere (radians) vs GeoJSON $near/$nearSphere (metres)
        // same physical distance (arnhem-berlin), expressed in each unit,
        // to nail down the exact conversion factor MongoDB uses internally
        {
            legacyPoint: {
                $nearSphere: ARNHEM,
                $minDistance: 0.07,
                $maxDistance: 0.09,
            },
        },
        {
            point: {
                $near: {
                    $geometry: { type: 'Point', coordinates: ARNHEM },
                    $minDistance: 400000,
                    $maxDistance: 600000,
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: { type: 'Point', coordinates: ARNHEM },
                    $minDistance: 400000,
                    $maxDistance: 600000,
                },
            },
        },

        // polygon winding: small (sub-hemisphere)
        {
            point: {
                $geoWithin: {
                    $geometry: { type: 'Polygon', coordinates: [smallCCW] },
                },
            },
        },
        {
            point: {
                $geoWithin: {
                    $geometry: { type: 'Polygon', coordinates: [smallCW] },
                },
            },
        },
        {
            point: {
                $geoIntersects: {
                    $geometry: { type: 'Polygon', coordinates: [smallCCW] },
                },
            },
        },
        {
            point: {
                $geoIntersects: {
                    $geometry: { type: 'Polygon', coordinates: [smallCW] },
                },
            },
        },

        // polygon winding: hemisphere-scale, geodesically-safe ring
        {
            point: {
                $geoWithin: {
                    $geometry: { type: 'Polygon', coordinates: [bigRingA] },
                },
            },
        },
        {
            point: {
                $geoWithin: {
                    $geometry: { type: 'Polygon', coordinates: [bigRingB] },
                },
            },
        },

        // polygon winding: hemisphere-scale, with strict-winding CRS
        // MongoDB ignores explicit ring winding for polygons above a
        // hemisphere UNLESS this CRS is set
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [bigRingA],
                        crs: {
                            type: 'name',
                            properties: {
                                name: 'urn:x-mongodb:crs:strictwinding:EPSG:4326',
                            },
                        },
                    },
                },
            },
        },
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [bigRingB],
                        crs: {
                            type: 'name',
                            properties: {
                                name: 'urn:x-mongodb:crs:strictwinding:EPSG:4326',
                            },
                        },
                    },
                },
            },
        },

        // the naive (edge-length-unsafe) "large rectangle" pitfall
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [naiveLargeRing],
                    },
                },
            },
        },
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [naiveLargeRingReversed],
                    },
                },
            },
        },
        // same naive ring, but with winding respected
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [naiveLargeRing],
                        crs: {
                            type: 'name',
                            properties: {
                                name: 'urn:x-mongodb:crs:strictwinding:EPSG:4326',
                            },
                        },
                    },
                },
            },
        },
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [naiveLargeRingReversed],
                        crs: {
                            type: 'name',
                            properties: {
                                name: 'urn:x-mongodb:crs:strictwinding:EPSG:4326',
                            },
                        },
                    },
                },
            },
        },

        // legitimate small antimeridian-crossing polygon
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [antimeridianSmall],
                    },
                },
            },
        },
        {
            point: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [antimeridianSmall],
                    },
                },
            },
        },

        // $centerSphere at/beyond a hemisphere (radians)
        { legacyPoint: { $geoWithin: { $centerSphere: [[0, 0], 3.14159] } } },
        { legacyPoint: { $geoWithin: { $centerSphere: [[0, 0], 3.15] } } },
    ],
    collection: {
        indices: [{ point: '2dsphere' }, { legacyPoint: '2d' }],
        records: [
            doc(1, 'origin', [0, 0]),
            doc(2, 'near-antipode', [179.9999, 0.0001]),
            doc(3, 'exact-antipode', [180, 0]),
            doc(4, 'west-of-dateline', [-179.9, 10]),
            doc(5, 'east-of-dateline', [179.9, 10]),
            doc(6, 'inside-small-square-and-big-band', [2, 2]),
            doc(7, 'inside-big-band-complement-sliver', [179, 70]),
            doc(8, 'near-dateline-probe-west-side', [179.5, -18]),
            doc(9, 'near-dateline-probe-east-side', [-179.5, -18]),
            doc(10, 'arnhem', ARNHEM),
            doc(11, 'berlin', BERLIN),
            doc(12, 'paris', PARIS),
        ],
    },
}
