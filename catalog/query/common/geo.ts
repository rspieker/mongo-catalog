import {
    compile,
    number,
    picker,
} from '../../../source/domain/generator/compiler';
import type { Catalog, MongoDocument } from '../../catalog';

// Generate documents with geospatial data
// Using coordinates around a central point with variation
const document = compile({
    name: picker(
        'Location A',
        'Location B',
        'Location C',
        'Point X',
        'Point Y'
    ),
    // GeoJSON Point with varied coordinates
    point: (seed: string) => {
        const baseLng = 5.89;
        const baseLat = 51.99;
        const lng = number(baseLng, baseLng + 0.02, 6)(seed + ':lng');
        const lat = number(baseLat, baseLat + 0.02, 6)(seed + ':lat');
        return {
            type: 'Point' as const,
            coordinates: [lng, lat],
        };
    },
    // GeoJSON LineString with varied coordinates
    line: (seed: string) => {
        const baseLng = 5.89;
        const baseLat = 51.99;
        const coords = [
            [
                number(baseLng, baseLng + 0.02, 6)(seed + ':l1'),
                number(baseLat, baseLat + 0.02, 6)(seed + ':l1'),
            ],
            [
                number(baseLng, baseLng + 0.02, 6)(seed + ':l2'),
                number(baseLat, baseLat + 0.02, 6)(seed + ':l2'),
            ],
            [
                number(baseLng, baseLng + 0.02, 6)(seed + ':l3'),
                number(baseLat, baseLat + 0.02, 6)(seed + ':l3'),
            ],
        ];
        return {
            type: 'LineString' as const,
            coordinates: coords,
        };
    },
    // GeoJSON Polygon with varied coordinates (triangle around center)
    polygon: (seed: string) => {
        const baseLng = 5.89;
        const baseLat = 51.99;
        const centerLng = number(
            baseLng + 0.005,
            baseLng + 0.015,
            6
        )(seed + ':cx');
        const centerLat = number(
            baseLat + 0.005,
            baseLat + 0.015,
            6
        )(seed + ':cy');
        const offset = 0.005;
        const coords = [
            [centerLng - offset, centerLat - offset],
            [centerLng + offset, centerLat - offset],
            [centerLng, centerLat + offset],
            [centerLng - offset, centerLat - offset], // Close the polygon
        ];
        return {
            type: 'Polygon' as const,
            coordinates: [coords],
        };
    },
    // Legacy coordinates (for 2d index) - varied
    legacyPoint: (seed: string) => {
        const baseLng = 5.89;
        const baseLat = 51.99;
        const lng = number(baseLng, baseLng + 0.02, 6)(seed + ':leg');
        const lat = number(baseLat, baseLat + 0.02, 6)(seed + ':leg');
        return [lng, lat];
    },
});

export type GeospatialDocument = MongoDocument<ReturnType<typeof document>>;

// Central reference point for queries (middle of the range)
const REF_LNG = 5.9;
const REF_LAT = 52.0;

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

        // $geoIntersects with non-Point query geometries
        {
            polygon: {
                $geoIntersects: {
                    $geometry: {
                        type: 'LineString',
                        coordinates: [
                            [5.89, 51.99],
                            [5.91, 52.01],
                        ],
                    },
                },
            },
        },
        {
            polygon: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.895, 51.995],
                                [5.905, 51.995],
                                [5.905, 52.005],
                                [5.895, 52.005],
                                [5.895, 51.995],
                            ],
                        ],
                    },
                },
            },
        },

        // $geoWithin on line and polygon fields
        {
            line: {
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

        // $nearSphere with legacy coordinates
        { legacyPoint: { $nearSphere: [REF_LNG, REF_LAT] } },
        {
            legacyPoint: {
                $nearSphere: [REF_LNG, REF_LAT],
                $maxDistance: 0.01,
            },
        },

        // $near/$nearSphere error cases
        { point: { $near: {} } },
        {
            point: {
                $near: { $geometry: { type: 'Polygon', coordinates: [] } },
            },
        },
        { point: { $nearSphere: {} } },

        // $near/$nearSphere with only $minDistance (no $maxDistance)
        {
            point: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [REF_LNG, REF_LAT] },
                    $minDistance: 100,
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: { type: 'Point', coordinates: [REF_LNG, REF_LAT] },
                    $minDistance: 100,
                },
            },
        },

        // $near/$nearSphere with $geometry as a bare legacy point array
        // (wrong shape for the GeoJSON form's $geometry key)
        { point: { $near: { $geometry: [REF_LNG, REF_LAT] } } },
        { point: { $nearSphere: { $geometry: [REF_LNG, REF_LAT] } } },

        // $near/$nearSphere with $geometry as a legacy polygon (array of >=3 points)
        {
            point: {
                $near: {
                    $geometry: [
                        [5.88, 51.98],
                        [5.92, 51.98],
                        [5.92, 52.02],
                    ],
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: [
                        [5.88, 51.98],
                        [5.92, 51.98],
                        [5.92, 52.02],
                    ],
                },
            },
        },

        // $near/$nearSphere with $geometry as a GeoJSON MultiPoint
        // (structurally valid GeoJSON, but $near/$nearSphere require Point)
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'MultiPoint',
                        coordinates: [
                            [5.9, 52.0],
                            [5.91, 52.01],
                        ],
                    },
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'MultiPoint',
                        coordinates: [
                            [5.9, 52.0],
                            [5.91, 52.01],
                        ],
                    },
                },
            },
        },

        // $near/$nearSphere with $geometry as a well-formed GeoJSON Polygon
        // (wrong type, but — unlike the degenerate empty-coordinates
        // Polygon above — structurally valid, so this isolates "wrong
        // type" from "malformed geometry" as the rejection reason)
        {
            point: {
                $near: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.88, 51.98],
                                [5.92, 51.98],
                                [5.92, 52.02],
                                [5.88, 51.98],
                            ],
                        ],
                    },
                },
            },
        },
        {
            point: {
                $nearSphere: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.88, 51.98],
                                [5.92, 51.98],
                                [5.92, 52.02],
                                [5.88, 51.98],
                            ],
                        ],
                    },
                },
            },
        },

        // $near/$nearSphere with $geometry as a plain string
        { point: { $near: { $geometry: 'not-a-geometry' } } },
        { point: { $nearSphere: { $geometry: 'not-a-geometry' } } },

        // $near/$nearSphere with $geometry as an array of numbers that
        // doesn't represent a valid legacy point (wrong length)
        { point: { $near: { $geometry: [REF_LNG] } } },
        { point: { $nearSphere: { $geometry: [REF_LNG] } } },

        // $geoIntersects error cases
        { point: { $geoIntersects: {} } },
        {
            point: {
                $geoIntersects: {
                    $geometry: { type: 'Point', coordinates: [] },
                },
            },
        },
        {
            point: {
                $geoIntersects: {
                    $geometry: { type: 'Point', coordinates: [0] },
                },
            },
        },

        // $geoWithin small polygon (likely matches nothing)
        {
            point: {
                $geoWithin: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [5.899, 51.999],
                                [5.901, 51.999],
                                [5.901, 52.001],
                                [5.899, 52.001],
                                [5.899, 51.999],
                            ],
                        ],
                    },
                },
            },
        },

        // $center with radius 0 (edge case)
        { legacyPoint: { $geoWithin: { $center: [[REF_LNG, REF_LAT], 0] } } },

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
};
