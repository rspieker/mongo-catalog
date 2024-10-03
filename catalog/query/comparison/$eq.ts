export const operations = [
    { unique: { $eq: true } },
    { name: { $eq: /Bathroom$/ } },
    { rarity: { $eq: 'unique' } },
    { name: { $eq: 'Neotenous Shakespearean Beach' } },
    { 'products.stock': { $eq: 15 } },
    { uuid: { $eq: '016c516d-ea4d-fd19-19ba-a66b9c1d' } },
    { 'color.favorite': { $eq: 'Beige' } },
    { 'color.favorite': { $eq: ['Beige'] } },
    { region: { $eq: 'EH' } },
];