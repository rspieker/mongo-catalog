import {
    compile,
    picker,
    several,
} from '../../../source/domain/generator/compiler'
import { Catalog, MongoDocument } from '../../catalog'

// Generate documents with text content for regex and text search testing
const document = compile({
    title: picker(
        'The Quick Brown Fox',
        'Lazy Dog Story',
        'Quick Start Guide',
        'Brown Bag Lunch Ideas',
        'JavaScript Programming',
        'MongoDB Guide',
        'Quick Reference Card',
        'Brown Leather Shoes',
        'The Quick Solution',
        'Fast Brown Runner'
    ),
    description: picker(
        'A comprehensive guide to JavaScript programming',
        'Learn MongoDB quickly with this tutorial',
        'Brown paper bag lunch ideas for work',
        'The quick brown fox jumps over the lazy dog',
        'Quick tips for better coding',
        'A lazy afternoon reading guide',
        'Brown shoes for formal occasions',
        'JavaScript: The Quick Way',
        'MongoDB in Action - A Practical Guide',
        'Quick and Easy Recipes'
    ),
    category: picker('tutorial', 'guide', 'reference', 'story', 'manual'),
    tags: several('javascript', 'mongodb', 'quick', 'brown', 'guide', 'tutorial', 'programming', 'database'),
    manufacturer: picker(
        'Quick Solutions Inc',
        'Brown Manufacturing',
        'Lazy Dog Productions',
        'JavaScript Experts LLC',
        'MongoDB Partners',
        'Programming Guides Co',
        'Tutorial Masters',
        'Reference Works Ltd'
    ),
})

export type TextRegexDocument = MongoDocument<ReturnType<typeof document>>

export const textRegex: Catalog<TextRegexDocument> = {
    operations: [
        // $regex - Basic patterns
        { title: { $regex: /^The/ } }, // Starts with "The"
        { title: { $regex: /Quick/ } }, // Contains "Quick"
        { title: { $regex: /Brown$/ } }, // Ends with "Brown"
        { description: { $regex: /quick/i } }, // Case insensitive
        { description: { $regex: /brown/i } }, // Case insensitive
        
        // $regex with options
        { title: { $regex: 'quick', $options: 'i' } }, // String pattern with options
        { title: { $regex: 'BROWN', $options: 'i' } }, // Case insensitive
        { description: { $regex: /^the/i } }, // Anchored + case insensitive
        { description: { $regex: /guide$/i } }, // End anchored + case insensitive
        
        // $regex with complex patterns
        { title: { $regex: /Quick.*Brown/ } }, // Contains both words
        { description: { $regex: /quick.*brown/i } }, // Both words, case insensitive
        { manufacturer: { $regex: /^Quick/ } }, // Starts with Quick
        { manufacturer: { $regex: /LLC$/ } }, // Ends with LLC
        { manufacturer: { $regex: /Co$/ } }, // Ends with Co
        
        // $regex with character classes
        { title: { $regex: /[A-Z].*Quick/ } }, // Starts with capital, contains Quick
        { category: { $regex: /^[tg]/ } }, // Starts with t or g
        { category: { $regex: /e$/ } }, // Ends with e
        
        // $regex combined with other operators
        { title: { $regex: /Quick/, $options: 'i' } },
        { description: { $regex: /MongoDB/ } },
        { description: { $regex: /JavaScript/i } },
        
        // Error cases - invalid regex
        { title: { $regex: '[invalid' } }, // Malformed regex
        { title: { $regex: 'pattern', $options: 'xyz' } }, // Invalid options
        
        // $text - Basic text search (requires text index)
        { $text: { $search: 'quick' } },
        { $text: { $search: 'brown' } },
        { $text: { $search: 'quick brown' } }, // Multiple words
        { $text: { $search: 'JavaScript programming' } },
        
        // $text with language
        { $text: { $search: 'quick', $language: 'en' } },
        { $text: { $search: 'guide', $language: 'en' } },
        
        // $text with case sensitivity
        { $text: { $search: 'Quick', $caseSensitive: true } },
        { $text: { $search: 'Quick', $caseSensitive: false } },
        { $text: { $search: 'BROWN', $caseSensitive: true } },
        { $text: { $search: 'BROWN', $caseSensitive: false } },
        
        // $text with diacritic sensitivity
        { $text: { $search: 'quick', $diacriticSensitive: true } },
        { $text: { $search: 'quick', $diacriticSensitive: false } },
        
        // $text combined options
        { $text: { $search: 'guide', $language: 'en', $caseSensitive: true } },
        { $text: { $search: 'guide', $language: 'en', $caseSensitive: false } },
        { $text: { $search: 'quick brown', $caseSensitive: false, $diacriticSensitive: false } },
        
        // Edge cases
        { title: { $regex: /^$/ } }, // Empty string pattern
        { title: { $regex: /.*/ } }, // Match all
        { title: { $regex: /.+/ } }, // Match any character
        
        // Nested field regex
        { 'tags.0': { $regex: /java/i } }, // First tag matches
        { 'tags.1': { $regex: /mongo/i } }, // Second tag matches
        
        // Array element matching
        { tags: { $regex: 'quick' } }, // Any element matches
        { tags: { $regex: /^java/i } }, // Any element starts with java
    ],
    collection: {
        indices: [
            { title: 'text', description: 'text', tags: 'text' },
        ],
        records: Array.from({ length: 25 }, (_, i) => document(i)),
    },
}
