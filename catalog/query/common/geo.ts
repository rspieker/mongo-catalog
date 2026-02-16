import {
    compile,
    picker,
    number,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with geospatial data
// Using coordinates around a central point with variation
const document = compile({
    name: picker('Location A', 'Location B', 'Location C', 'Point X', 'Point Y'),
    // GeoJSON Point with varied coordinates
    point: (seed: string) => {
        const baseLng = 5.89
        const baseLat = 51.99
        const lng = number(baseLng, baseLng + 0.02, 6)(seed + ':lng')
        const lat = number(baseLat, baseLat + 0.02, 6)(seed + ':lat')
        return {
            type: 'Point' as const,
            coordinates: [lng, lat],
        }
    },
    // GeoJSON LineString with varied coordinates
    line: (seed: string) => {
        const baseLng = 5.89
        const baseLat = 51.99
        const coords = [
            [number(baseLng, baseLng + 0.02, 6)(seed + ':l1'), number(baseLat, baseLat + 0.02, 6)(seed + ':l1')],
            [number(baseLng, baseLng + 0.02, 6)(seed + ':l2'), number(baseLat, baseLat + 0.02, 6)(seed + ':l2')],
            [number(baseLng, baseLng + 0.02, 6)(seed + ':l3'), number(baseLat, baseLat + 0.02, 6)(seed + ':l3')],
        ]
        return {
            type: 'LineString' as const,
            coordinates: coords,
        }
    },
    // GeoJSON Polygon with varied coordinates (triangle around center)
    polygon: (seed: string) => {
        const baseLng = 5.89
        const baseLat = 51.99
        const centerLng = number(baseLng + 0.005, baseLng + 0.015, 6)(seed + ':cx')
        const centerLat = number(baseLat + 0.005, baseLat + 0.015, 6)(seed + ':cy')
        const offset = 0.005
        const coords = [
            [centerLng - offset, centerLat - offset],
            [centerLng + offset, centerLat - offset],
            [centerLng, centerLat + offset],
            [centerLng - offset, centerLat - offset], // Close the polygon
        ]
        return {
            type: 'Polygon' as const,
            coordinates: [coords],
        }
    },
    // Legacy coordinates (for 2d index) - varied
    legacyPoint: (seed: string) => {
        const baseLng = 5.89
        const baseLat = 51.99
        const lng = number(baseLng, baseLng + 0.02, 6)(seed + ':leg')
        const lat = number(baseLat, baseLat + 0.02, 6)(seed + ':leg')
        return [lng, lat]
    },
})

export type GeospatialDocument = MongoDocument<ReturnType<typeof document>>

// Central reference point for queries (middle of the range)
const REF_LNG = 5.9
const REF_LAT = 52.0

export const geo: Catalog<GeospatialDocument> = {
    operations: [
        // $geoIntersects - Geometry intersection
        // Query for a point that should intersect with some documents
        {
            point: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                },
            },
        },
        // Query line against point - should match lines passing through/near the point
        {
            line: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                },
            },
        },
        // Query polygon against point - should match polygons containing the point
        {
            polygon: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                },
            },
        },

        // $geoWithin - Within geometry
        // Large polygon that should contain many points
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.88, 51.98],
                                [5.92, 51.98],
                                [5.92, 52.02],
                                [5.88, 52.02],
                                [5.88, 51.98],
                            ],
                        ],
                    },
                },
            },
        },

        // $geoWithin with $box - large box
        {
            legacyPoint: {
                $geoWithin: {
                    $box: [
                        [5.88, 51.98],
                        [5.92, 52.02],
                    ],
                },
            },
        },

        // $geoWithin with $center - large radius
        {
            legacyPoint: {
                $geoWithin: {
                    $center: [[REF_LNG, REF_LAT], 0.02],
                },
            },
        },

        // $geoWithin with $centerSphere - larger radius in radians
        {
            legacyPoint: {
                $geoWithin: {
                    $centerSphere: [[REF_LNG, REF_LAT], 0.01],
                },
            },
        },

        // $geoWithin with $polygon
        {
            legacyPoint: {
                $geoWithin: {
                    $polygon: [
                        [5.88, 51.98],
                        [5.92, 51.98],
                        [5.92, 52.02],
                    ],
                },
            },
        },

        // $near - Near a point (should return nearest documents)
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                },
            },
        },
        // With maxDistance
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                    $maxDistance: 5000,
                },
            },
        },
        // With min and max distance
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                    $minDistance: 100,
                    $maxDistance: 10000,
                },
            },
        },

        // $near with legacy coordinates
        {
            legacyPoint: {
                $near: [REF_LNG, REF_LAT],
            },
        },
        {
            legacyPoint: {
                $near: [REF_LNG, REF_LAT],
                $maxDistance: 0.02,
            },
        },

        // $nearSphere - Near on a sphere
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                    $maxDistance: 5000,
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [REF_LNG, REF_LAT],
                    },
                    $minDistance: 100,
                    $maxDistance: 10000,
                },
            },
        },

        // Error cases
        { point: { $geoWithin: { $unknown: {} } } },
        { point: { $geoWithin: { $geometry: {} } } },
        { point: { $geoWithin: { $box: {} } } },
        { point: { $geoWithin: { $center: [1] } } },
        { point: { $geoWithin: { $center: 'invalid' } } },
        {
            point: {
                $geoWithin: {
                    $geometry: { type: 'Invalid', coordinates: [] },
                },
            },
        },
    ],
    collection: {
        indices: [
            { point: '2dsphere' },
            { line: '2dsphere' },
            { polygon: '2dsphere' },
            { legacyPoint: '2d' },
        ],
        records: Array.from({ length: 15 }, (_, i) => document(i)),
    },
}
