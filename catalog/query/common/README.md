# MongoDB Common Test Data

This directory contains representative test data and queries for various MQL
(MongoDB Query Language) operators, designed to test compatibility across
different MongoDB versions.

## Structure

Each file contains:

- `operations`: Array of query operations to test
- `collection`: Test collection with:
    - `indices`: Array of indexes that should exist on the collection
    - `records`: Array of sample documents (approximately 20 diverse records)

## Files

### `comparison.ts`

Comparison operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`

- Includes type mismatches, null comparisons, and error cases

### `logical.ts`

Logical operators: `$and`, `$or`, `$nor`, `$not`

- Complex nesting, empty arrays, and invalid inputs

### `array.ts`

Array operators: `$all`, `$elemMatch`, `$size`

- Nested arrays, mixed data types, and edge cases

### `evaluation.ts`

Evaluation operators: `$expr` (aggregation expressions in queries)

- Arithmetic, string, date, array, and conditional operations
- Complex business logic expressions

### `element.ts`

Element operators: `$exists`, `$type`

- Field existence checks, type validation, BSON type codes
- Mixed data types and null handling

## Data Design Principles

1. **Diverse Document Structure**: Each collection contains ~20 records with:
    - Various data types (string, number, boolean, array, object, date, null)
    - Nested objects and arrays
    - Edge cases (empty arrays, null values, missing fields)
    - Mixed BSON types (ObjectId, BinData, RegExp, Decimal128, Long, Int)

2. **Realistic Business Data**: Users/accounts with:
    - Profile information (rating, premium status, balance)
    - Activity data (login counts, last login dates)
    - Tags/permissions arrays
    - Transaction/product arrays
    - Nested hierarchical data

3. **Comprehensive Query Coverage**:
    - **Happy path**: Valid queries that should match
    - **Error cases**: Invalid syntax, type mismatches, null handling
    - **Edge cases**: Empty arrays, large values, boundary conditions
    - **Complex nesting**: Multiple operators combined

4. **Error Testing**: Each file includes intentional errors to test:
    - Type mismatches (string vs number)
    - Invalid operator arguments
    - Non-existent field references
    - Division by zero in expressions
    - Invalid type names/codes

## Usage

```javascript
const commonData = require('./index')

// Get all test data
const allData = commonData.getAllTestData()

// Get all operations for testing
const allOperations = commonData.getAllOperations()

// Get mixed operations for complex scenarios
const mixedOps = commonData.getMixedOperations()

// Example: Run comparison operations against comparison collection
const comparisonData = allData.comparison
comparisonData.operations.forEach((query) => {
    // Run query against comparisonData.collection.records
    console.log('Testing query:', query)
})
```

## Purpose

This test data is designed for:

1. **Version Compatibility Testing**: Verify query behavior across MongoDB
   versions
2. **Driver Testing**: Test different MongoDB driver implementations
3. **MQL Engine Development**: Test custom MongoDB query implementations
4. **Regression Testing**: Catch behavior changes between versions
5. **Documentation Examples**: Realistic examples for operator documentation
