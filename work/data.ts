import { writeFile } from 'node:fs/promises';
import { Country, DateInRange, GeoJSON, Geometry, Integer, List, Name, Pick, Point, SHA256, ShortID, UUID } from './data/generator';
import { adjectives_color, countries } from './data/lists';

function getPoint(geojson: GeoJSON | null): Point | undefined {
    if (!geojson) {
        return;
    }

    if (geojson.type === 'Point') {
        return geojson;
    }
    if (geojson.type === 'Feature' && geojson.geometry) {
        return getPoint(geojson.geometry);
    }
    if (geojson.type === 'FeatureCollection') {
        const [point] = geojson.features.map(getPoint).filter(Boolean);

        return point;
    }
    if (geojson.type === 'GeometryCollection') {
        const [point] = geojson.geometries.map(getPoint).filter(Boolean);

        return point;
    }
}

function getLegacyArray(geojson: GeoJSON | null): [number, number] | undefined {
    const point = getPoint(geojson);

    if (point) {
        return point.coordinates.slice(0, 2) as [number, number];
    }
}

function getLegacyObject(geojson: GeoJSON | null): { one: number, two: number } | undefined {
    const point = getPoint(geojson);

    if (point) {
        const [one, two] = point.coordinates;

        return { one, two };
    }
}

const commonality = ['common', 'uncommon', 'rare', 'unique'];

function document(index: number = 0): { [key: string]: unknown } {
    const seed = SHA256(index);
    const id = ShortID(seed, 7);
    const rarity = Pick(seed, commonality.slice(0, index % 7 === 1 ? commonality.length : (index % 2) + 1));
    const color = List(SHA256(seed, 'color'), adjectives_color, 5);
    const country: Country = Pick(SHA256(seed, 'country'), countries);
    const name = Name(SHA256(seed, 'name'), 2, 4);
    const tld = Pick(SHA256(seed, 'tld'), [...country.codes.filter(({ type }) => type === 'tld').map(({ code }) => code), 'com']);
    const [tel] = country.codes.filter(({ type }) => type === 'tel');
    const web = tld && name
        ? [name.replace(/[^\w]+/g, '-'), tld].join('.').toLocaleLowerCase()
        : undefined;
    const email = Pick(SHA256(seed, 'email'), ['info', 'hello', 'contact', Name(seed, 1, 2).replace(/[^\w]+/g, '-').toLocaleLowerCase()]);
    const parts = Integer(seed, 2, 4);
    const geojson = Geometry(seed, country);
    const unique = rarity === 'unique';

    if (unique) {
        commonality.pop();
    }

    return {
        _id: id,
        index,
        unique,
        rarity,
        uuid: UUID(seed),
        name,
        website: `www.${web}`,
        contact: {
            email: [email, web].join('@'),
            phone: tel ? [`+${tel.code}`, ShortID(seed, 12 - String(tel.code).length, '1234567890')].join(Pick(seed, ['-', ' ', ''])) : undefined,
        },
        color: {
            favorite: Pick(seed, List(seed, color, color.length)),
            range: color,
        },
        location: {
            geojson,
            legacyArray: getLegacyArray(geojson),
            legacyObject: getLegacyObject(geojson),
        },
        region: Pick(SHA256(seed, country.name), country.codes.filter(({ type }) => type.startsWith('iso') && !type.endsWith('N')))?.code,
        products: Array.from({ length: Integer(seed + 'products', 0, 7) }, (_, i) => SHA256(seed, i)).map((s) => ({
            name: Name(s, 2, parts),
            price: Number((Integer(s, 100, 10000) / 100).toFixed(2)),
            stock: Integer(s, 0, 100),
            size: List(s, ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'], 3),
        })),
        established: DateInRange(seed, '1995', '2015'),
    };
}

const documents = Array.from({ length: 100 }, (_, i) => document(i));

console.dir(documents, { depth: null });
// console.dir(documents.map(({ rarity }) => rarity));
console.dir(documents.map(({ rarity }) => rarity).reduce((c: any, r: any) => {
    c[r] = (c[r] || 0) + 1;

    return c;
}, {}));

writeFile('./work/data.json', JSON.stringify(documents, null, '\t')).then(() => console.log('done'));
