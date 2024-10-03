import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function serialize(input: unknown): string {
    return JSON.stringify(input, null, '\t')
        .replace(/(\[\s*(?:-?\d+(?:\.\d+)?,?\s*)*\])/gm, (_: unknown, match: string) => match
            .replace(/\s+/g, '')
            .replace(/,/g, ', ')
        )
        .replace(/(\{\s*(?:\s*"[^"]+":[^\n]+\s*){1,3}\})/gm, (_: unknown, match: string) => match
            .replace(/\s+/g, ' ')
        )
}

readFile(resolve(__dirname, 'geognos-countries.json'))
    .then((buffer: Buffer) => JSON.parse(buffer.toString('utf-8')))
    .then(({ Results }: any) => Object.keys(Results).map((key) => Results[key]))
    .then((list: Array<any>) => list.map(({ Name, Capital, GeoRectangle, GeoPt, TelPref, CountryCodes }) => ({
        name: Name,
        codes: Object.keys(CountryCodes)
            .map((type) => ({ type, code: CountryCodes[type] }))
            .concat(TelPref ? { type: 'tel', code: TelPref } : []),
        geospatial: [
            Capital && {
                type: 'point',
                category: 'capital',
                name: Capital.Name,
                coordinates: Capital.GeoPt,
            },
            GeoPt && {
                type: 'point',
                category: 'country-center',
                name: Name,
                coordinates: GeoPt,
            },
            GeoRectangle ? {
                type: 'box',
                category: 'country-square',
                name: Name,
                coordinates: [
                    [GeoRectangle.East, GeoRectangle.North],
                    [GeoRectangle.West, GeoRectangle.South],
                ],
            } : undefined,
        ].filter(Boolean),
    }
    )))
    .then((json: any) => writeFile(resolve(__dirname, '..', 'data', 'countries.json'), serialize(json)));
