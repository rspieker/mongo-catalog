import { type Hash as H, createHash } from 'node:crypto';
import { adjectives, countries, noun } from './lists';

type HashAlgorithm = Parameters<typeof createHash>[0];
type HashDigest = Parameters<ReturnType<typeof createHash>['digest']>[0];

const LC = 'abcdefghijklmnopqrstuvwxyz';
const UC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGIT = '0123456789';
const alphanum = `${LC}${UC}${DIGIT}`;

export function Hash(algorithm: HashAlgorithm, digest: HashDigest, ...values: [unknown, ...Array<unknown>]): string {
    return values.reduce((carry: H, value) => carry.update(JSON.stringify(value)), createHash(algorithm)).digest(digest);
}

export const SHA256 = (...values: [unknown, ...Array<unknown>]): string => Hash('sha256', 'hex', ...values);

export function SUM(...numbers: Array<number>): number {
    return numbers.reduce((carry, num) => carry + num, 0);
}

export function AVG(...numbers: Array<number>): number {
    return SUM(...numbers) / numbers.length;
}

export function MIN(...numbers: Array<number>): number {
    return Math.min(...numbers);
}

export function MAX(...numbers: Array<number>): number {
    return Math.max(...numbers);
}

function CodePoints(seed: string): Array<number> {
    return Array.from(seed, (c) => c.codePointAt(0)).filter((n) => n !== undefined);
}

function Confine(value: number, min: number, max: number): number {
    if (min > -Infinity) {
        const range = max - min;

        return min + (value % range);
    }

    return value % max;
}

export function ShortID(seed: string, length: number = 7, alphabet: string = alphanum): string {
    return CodePoints(SHA256(seed))
        .reduce((carry, cp, i) => {
            const pos = i % length;

            carry[pos] = (carry[pos] ? carry[pos] : 0) + cp;

            return carry;
        }, [] as Array<number>)
        .map((v, i) => alphabet[v % alphabet.length])
        .join('');
}

export function UUID(seed: string): string {
    //'00000000-0000-0000-0000-000000000000'
    const hash = SHA256(seed);
    return [
        hash.slice(0, 8),
        hash.slice(9, 13),
        hash.slice(14, 18),
        hash.slice(19, 23),
        hash.slice(24, 32),
    ].join('-');
}

export function Integer(seed: string, min: number = 0, max: number = Infinity): number {
    let codepoints = CodePoints(seed)
        .map((cp, i) => cp * ((i % 5) + 1));

    if (min < 0) {
        const avg = AVG(...codepoints);
        codepoints = codepoints.map((cp, i) => cp < avg ? cp * -1 : cp);
    }

    return Confine(SUM(...codepoints), min, max);
}

export function List<T = unknown>(seed: string, source: Array<T>, limit: number = 3): Array<T> {
    const codepoints = CodePoints(seed);
    const ranged = codepoints.map((cp) => cp % source.length);
    const unique = [...new Set(ranged)];
    const count = Confine(SUM(...codepoints), 1, MIN(limit, source.length));

    return unique.slice(0, count).map((cp) => source[cp]);
}

export function Pick<T = unknown>(seed: string, source: Array<T>): T {
    const codepoints = CodePoints(seed);

    return source[Math.round(AVG(...codepoints)) % source.length];
}

const adjectives_indices = adjectives.map((_, i) => i);

export function Name(seed: string, min: number = 1, max: number = 4): string {
    const subject = Pick(seed, noun);
    const indices = List(subject + seed, adjectives_indices, max);
    const prefix: Array<string> = [];

    for (const index of indices) {
        prefix.push(Pick(subject + seed, adjectives[index]));
    }

    return prefix.filter(Boolean).concat(subject).join(' ');
}

export function DateInRange(seed: string, min: string, max: string): Date {
    const [ay = 1980, am = 1, ad = 1] = min.split('-').map((v) => Number(v)).map((v) => isNaN(v) ? undefined : v);
    const [by = 2020, bm = 12, bd = 31] = max.split('-').map((v) => Number(v)).map((v) => isNaN(v) ? undefined : v);
    const date = [Integer(seed, ay, by), Integer(seed, am, bm), Integer(seed, ad, bd)].map((v) => v < 10 ? `0${v}` : v).join('-');

    return new Date(date);
}

export type Longitude = number;
export type Latitude = number;
export type Altitude = number;
export type Position = [Longitude, Latitude, Altitude?];
type GeoJSONObject<T extends string, O extends { [key: string]: unknown }>
    = {
        type: T
    }
    & O;
type GeoJSONGeometry<T extends string, C extends Array<unknown>>
    = GeoJSONObject<T, { coordinates: C }>;
type GeoJSONMultiGeometry<T extends GeoJSONGeometry<string, Array<unknown>>>
    = GeoJSONGeometry<`Multi${T['type']}`, Array<T['coordinates']>>
export type LinearRing = [Position, Position, Position, Position, ...Array<Position>];
export type ExteriorRing = LinearRing;
export type InteriorRing = LinearRing;
export type Point = GeoJSONGeometry<'Point', Position>;
export type MultiPoint = GeoJSONMultiGeometry<Point>;
export type LineString = GeoJSONGeometry<'LineString', [Position, Position, ...Array<Position>]>;
export type MultiLineString = GeoJSONMultiGeometry<LineString>;
export type Polygon = GeoJSONGeometry<'Polygon', [ExteriorRing, ...Array<InteriorRing>]>;
export type MultiPolygon = GeoJSONMultiGeometry<Polygon>;
export type Geometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;
export type GeometryCollection = GeoJSONObject<'GeometryCollection', { geometries: Array<Geometry | GeometryCollection> }>;
export type Feature = GeoJSONObject<'Feature', { geometry: Geometry | GeometryCollection | null, properties: null | { [key: string]: unknown } }>;
export type FeatureCollection = GeoJSONObject<'FeatureCollection', { features: Array<Feature> }>;
export type GeoJSON = Geometry | GeometryCollection | Feature | FeatureCollection;

export type Country = {
    name: string;
    codes: Array<{
        type: 'tld' | 'iso3' | 'iso2' | 'fips' | 'tel';
        code: string;
    } | {
        type: 'isoN';
        code: number;
    }>;
    geospatial: Array<{
        type: 'point';
        category: string;
        name: string;
        coordinates: Position;
    } | {
        type: 'box';
        category: string;
        name: string;
        coordinates: [Position, Position];
    }>;
};

export function Country(seed: string): Country {
    return Pick(seed, countries);
}

export function Geospatial(seed: string, { geospatial }: Country): Position | [Position, Position] {
    const picked = Pick(seed, geospatial);

    return picked.coordinates;
}

export function Geometry(seed: string, country: Country): GeoJSON | null {
    const geometry = Pick(seed, country.geospatial);
    const shape = Pick(seed + country.name, ['geometry', 'geometrycollection', 'feature', 'featurecollection']);
    let geojson: GeoJSON | null = null;

    if (geometry.type === 'box') {
        const { coordinates } = geometry;
        const [[ax, ay], [bx, by]] = coordinates;

        geojson = {
            type: 'Polygon',
            coordinates: [
                [
                    [ax, ay],
                    [ax, by],
                    [bx, by],
                    [bx, ay],
                    [ax, ay],
                ],
            ],
        };
    }

    if (geometry.type === 'point') {
        geojson = {
            type: 'Point',
            coordinates: geometry.coordinates,
        };
    }

    if (shape.startsWith('feature')) {
        geojson = {
            type: 'Feature',
            properties: {
                name: geometry.name,
                type: geometry.category,
                iso: country.codes.filter(({ type }) => type === 'iso2' || type === 'iso3')[0],
            },
            geometry: geojson,
        };
    }
    if (shape === 'featurecollection') {
        geojson = {
            type: 'FeatureCollection',
            features: [geojson as Feature],
        };
    }
    else if (shape === 'geometrycollection') {
        geojson = {
            type: 'GeometryCollection',
            geometries: [geojson as Geometry],
        }
    }

    return geojson;
}