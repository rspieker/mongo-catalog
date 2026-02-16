import {
    compile,
    picker,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with geospatial data
const document = compile({
    name: picker('Location A', 'Location B', 'Location C', 'Point X', 'Point Y'),
    // GeoJSON Point
    point: () => ({
        type: 'Point' as const,
        coordinates: [5.896975994110107, 51.995886985217844],
    }),
    // GeoJSON LineString
    line: () => ({
        type: 'LineString' as const,
        coordinates: [
            [5.8908069133758545, 52.000709060198815],
            [5.892062187194824, 51.9990973559411],
            [5.895602703094482, 52.00068263928538],
        ],
    }),
    // GeoJSON Polygon
    polygon: () => ({
        type: 'Polygon' as const,
        coordinates: [
            [
                [5.8908069133758545, 52.000709060198815],
                [5.892062187194824, 51.9990973559411],
                [5.895602703094482, 52.00068263928538],
                [5.8908069133758545, 52.000709060198815],
            ],
        ],
    }),
    // Legacy coordinates (for 2d index)
    legacyPoint: () => [5.896975994110107, 51.995886985217844],
})

export type GeospatialDocument = MongoDocument<ReturnType<typeof document>>

export const geo: Catalog<GeospatialDocument> = {
    operations: [
        // $geoIntersects - Geometry intersection
        {
            point: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                },
            },
        },
        {
            line: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.892062187194824, 51.9990973559411],
                    },
                },
            },
        },
        {
            polygon: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.892062187194824, 51.9990973559411],
                    },
                },
            },
        },

        // $geoWithin - Within geometry
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.8908069133758545, 52.000709060198815],
                                [5.892062187194824, 51.9990973559411],
                                [5.895602703094482, 52.00068263928538],
                                [5.8908069133758545, 52.000709060198815],
                            ],
                        ],
                    },
                },
            },
        },

        // $geoWithin with $box
        {
            legacyPoint: {
                $geoWithin: {
                    $box: [
                        [5.89, 51.99],
                        [5.90, 52.00],
                    ],
                },
            },
        },

        // $geoWithin with $center
        {
            legacyPoint: {
                $geoWithin: {
                    $center: [[5.896975994110107, 51.995886985217844], 0.005],
                },
            },
        },

        // $geoWithin with $centerSphere
        {
            legacyPoint: {
                $geoWithin: {
                    $centerSphere: [
                        [5.896975994110107, 51.995886985217844],
                        0.0005,
                    ],
                },
            },
        },

        // $geoWithin with $polygon
        {
            legacyPoint: {
                $geoWithin: {
                    $polygon: [
                        [5.8908069133758545, 52.000709060198815],
                        [5.892062187194824, 51.9990973559411],
                        [5.895602703094482, 52.00068263928538],
                    ],
                },
            },
        },

        // $near - Near a point
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                },
            },
        },
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                    $maxDistance: 1000,
                },
            },
        },
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                    $minDistance: 100,
                    $maxDistance: 5000,
                },
            },
        },

        // $near with legacy coordinates
        {
            legacyPoint: {
                $near: [5.896975994110107, 51.995886985217844],
            },
        },
        {
            legacyPoint: {
                $near: [5.896975994110107, 51.995886985217844],
                $maxDistance: 0.01,
            },
        },

        // $nearSphere - Near on a sphere
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                    $maxDistance: 1000,
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [5.896975994110107, 51.995886985217844],
                    },
                    $minDistance: 100,
                    $maxDistance: 5000,
                },
            },
        },

        // Error cases
        { point: { $geoWithin: { $unknown: {} } } }, // Unknown operator
        { point: { $geoWithin: { $geometry: {} } } }, // Empty geometry
        { point: { $geoWithin: { $box: {} } } }, // Invalid box
        { point: { $geoWithin: { $center: [1] } } }, // Missing radius
        { point: { $geoWithin: { $center: 'invalid' } } }, // Invalid center

        // Invalid geometries
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
