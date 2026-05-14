// Categorized field name pools for catalog document generation.
// Names are chosen to be recognizable in query contexts:
// e.g. "why does { age: { $gte: 18 } } return this?" is easier to reason about
// than "why does { numericField: { $gte: 18 } } return this?"

export const fieldNames = {
    // Small integer values (0–100)
    integer: [
        'age', 'score', 'rank', 'level', 'count', 'grade',
        'step', 'priority', 'capacity', 'attempts', 'quantity', 'size',
        'index', 'depth', 'weight', 'height',
    ],

    // Larger or floating-point values
    decimal: [
        'price', 'rating', 'balance', 'amount', 'discount',
        'percentage', 'salary', 'distance', 'duration', 'ratio',
    ],

    // Short categorical strings (status/type-like)
    category: [
        'status', 'category', 'type', 'region', 'language',
        'currency', 'format', 'mode', 'state', 'phase', 'tier',
    ],

    // Human-readable name strings
    label: [
        'name', 'title', 'username', 'email', 'address',
        'description', 'note', 'comment', 'reference', 'code',
    ],

    // Boolean flags
    flag: [
        'active', 'enabled', 'visible', 'premium', 'verified',
        'locked', 'published', 'deleted', 'featured', 'archived',
    ],

    // Arrays of numbers
    numericArray: [
        'scores', 'ratings', 'counts', 'values', 'points',
        'rankings', 'indices', 'weights', 'quantities', 'levels',
    ],

    // Arrays of strings
    stringArray: [
        'tags', 'roles', 'permissions', 'categories', 'labels',
        'groups', 'keywords', 'topics', 'regions', 'formats',
    ],

    // Date/timestamp fields
    date: [
        'createdAt', 'updatedAt', 'birthDate', 'expiresAt',
        'startDate', 'publishedAt', 'scheduledAt', 'archivedAt',
    ],
} as const

export type FieldNameCategory = keyof typeof fieldNames
