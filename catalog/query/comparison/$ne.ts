export const operations = [
    { unique: { $ne: false } },
    { name: { $ne: /Bathroom$/ } },
    {
        rarity: { $ne: 'common' },
        'color.range': { $ne: 'Cerise' },
        'location.legacyArray': { $ne: null },
        region: { $ne: 'PER' },
    }
];
