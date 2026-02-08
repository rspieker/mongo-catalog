import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Helper to load text files into arrays
function loadTextFile(filename: string): Array<string> {
    const content = readFileSync(resolve(__dirname, filename), 'utf-8')
    const entries = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))

    return [...new Set(entries)]
}

// Helper to load latinization map from text file
function loadLatinizationMap(filename: string): Record<string, string> {
    const content = readFileSync(resolve(__dirname, filename), 'utf-8')
    const map: Record<string, string> = {}

    content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line?.includes(':'))
        .forEach((line) => {
            const [char, replacement] = line.split(':')
            if (char && replacement) {
                map[char] = replacement
            }
        })

    return map
}

// Load nouns from text file
export const noun = loadTextFile('nouns.txt')

// Load cities from text file
export const cities_with_diacritics = loadTextFile('cities_diacritics.txt')

// Load latinization map
const latinizationMap = loadLatinizationMap('latinization.txt')

// Comprehensive Latinization function
function latinize(input: string): string {
    return Array.from(input.normalize('NFD'))
        .filter((char) => !/[\u0300-\u036f]/.test(char))
        .map((char) => (char in latinizationMap ? latinizationMap[char] : char))
        .join('')
        .normalize('NFC')
}

// Same list with all characters fully Latinized for comparison testing
export const cities_latinized = cities_with_diacritics.map(latinize)

// adjectives
export const adjectives_quantitative = loadTextFile(
    'adjectives_quantitative.txt'
)
export const adjectives_size = loadTextFile('adjectives_size.txt')
export const adjectives_age = loadTextFile('adjectives_age.txt')
export const adjectives_shape = loadTextFile('adjectives_shape.txt')
export const adjectives_color = loadTextFile('adjectives_color.txt')
export const adjectives_proper = loadTextFile('adjectives_proper.txt')
export const adjectives_material = loadTextFile('adjectives_material.txt')
export const adjectives_purpose = loadTextFile('adjectives_purpose.txt')
export const adjectives = [
    adjectives_quantitative,
    adjectives_size,
    adjectives_age,
    adjectives_shape,
    adjectives_color,
    adjectives_proper,
    adjectives_material,
    adjectives_purpose,
]
export const adjectives_indices = adjectives.map((_, i) => i)

// Countries loaded from JSON file
export const countries = JSON.parse(
    readFileSync(resolve(__dirname, 'countries.json'), 'utf-8')
)
