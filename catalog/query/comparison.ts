export const operations = [
    {
        group: 'implicit - $eq',
        ops: [
            { unique: true },
            { name: /Bathroom$/ },
            { rarity: 'unique' },
            { name: 'Neotenous Shakespearean Beach' },
            { 'products.stock': 15 },
            { uuid: '016c516d-ea4d-fd19-19ba-a66b9c1d' },
            { 'color.favorite': 'Beige' },
            { 'color.favorite': ['Beige'] },
            { region: 'EH' },
        ],
    },
    {
        group: '$eq',
        ops: [
            { unique: { $eq: true } },
            { name: { $eq: /Bathroom$/ } },
            { rarity: { $eq: 'unique' } },
            { name: { $eq: 'Neotenous Shakespearean Beach' } },
            { 'products.stock': { $eq: 15 } },
            { uuid: { $eq: '016c516d-ea4d-fd19-19ba-a66b9c1d' } },
            { 'color.favorite': { $eq: 'Beige' } },
            { 'color.favorite': { $eq: ['Beige'] } },
            { region: { $eq: 'EH' } },
        ]
    },
    {
        group: '$ne',
        ops: [
            { unique: { $ne: false } },
            { name: { $ne: /Bathroom$/ } },
            {
                rarity: { $ne: 'common' },
                'color.range': { $ne: 'Cerise' },
                'location.legacyArray': { $ne: null },
                region: { $ne: 'PER' },
            }
        ],
    },
    {
        group: '$gt',
        ops: [
            { 'products.price': { $gt: 50.52 } },
            { index: { $gt: 98 } },
            { established: { $gt: new Date('2014-10-20T00:00:00.0Z') } },
        ],
    },
];