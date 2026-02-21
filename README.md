# Mongo Catalog

A comprehensive MongoDB compatibility testing framework that collects query results across multiple MongoDB versions to identify behavioral differences and version-specific quirks.

## Overview

Mongo Catalog tests MongoDB query operators across different server versions by:
1. **Discovering** all available MongoDB Docker image versions
2. **Generating** test data and queries for various MongoDB operators
3. **Executing** queries against each MongoDB version
4. **Unifying** results to find version-specific behaviors

This helps identify:
- Which operators work consistently across versions
- Where behavioral differences exist between versions
- Error handling variations
- Edge case behaviors

## Architecture

```
mongo-catalog/
├── catalog/              # Query catalogs (test definitions)
│   └── query/           # Query operator tests
│       ├── common/      # Common operator catalogs
│       └── comparison/  # Specific operator tests
├── chore/               # Automation scripts
├── source/              # Shared code
│   └── domain/         # Domain logic (versions, drivers, generators)
└── automation/         # Generated data (gitignored)
    ├── catalog-queries.json   # Registered catalogs
    └── collect/              # Collection results per version
        └── v8/
            └── 8.2.5/        # Results for version 8.2.5
                ├── array.json
                ├── bitwise.json
                └── ...
```

## Chores (Automation Scripts)

The project uses a chore-based workflow where each script has a specific responsibility:

### 1. `update:mongo-versions`
**File:** `chore/mongo-docker-images.ts`

Queries Docker Hub for all available MongoDB image tags, filters for AMD64 Linux images with valid semantic versions, and maintains a version registry.

**Output:** `automation/mongo-docker-images.json`
```json
{
  "versions": [
    {"name": "8.2.5", "major": 8, "minor": 2, "patch": 5, "releases": [...]},
    {"name": "7.0.16", "major": 7, "minor": 0, "patch": 16, "releases": [...]}
  ]
}
```

**When to run:** Periodically to discover new MongoDB releases.

### 2. `update:catalog-queries`
**File:** `chore/catalog-queries.ts`

Discovers and registers all catalog files in `catalog/query/**/*.ts`. Calculates content hashes to detect changes and tracks catalog evolution history.

**Output:** `automation/catalog-queries.json`
```json
[
  {
    "name": "array",
    "path": "catalog/query/common/array.ts",
    "exports": [{"name": "array", "type": "Catalog", "hash": "sha256:..."}],
    "update": [{"type": "INITIAL", "date": "2024-01-15T10:30:00Z"}]
  }
]
```

**When to run:** After adding or modifying catalog files.

### 3. `update:workload`
**File:** `chore/workload.ts`

Analyzes which MongoDB versions need testing based on:
- Catalog changes (new or modified catalogs)
- Collection history (what's already been collected)
- Version prioritization (smart bisection algorithm)

**Prioritization Algorithm:**
- Priority 1: Latest version in each minor series
- Priority 2: Earliest version in each minor series
- Priority 3-99: Middle versions via binary search bisection
- Priority 1000: Versions with no pending work

**Exponential Backoff for Failing Builds:**
Versions that fail collection enter a retry queue with exponential backoff:
- 1st failure: Retry after 1 day
- 2nd failure: Retry after 2 days
- 3rd failure: Retry after 4 days
- And so on (1, 2, 4, 8, 16... days)

This prevents wasting resources on persistently failing versions while eventually retrying in case the issue was transient.

Uses checksum comparison to skip redundant testing when adjacent versions produce identical results.

**Output:** Creates `plan.json` files per version:
```json
{
  "version": "8.2.5",
  "catalogs": [{"name": "array", "path": "...", "hash": "..."}],
  "created": "2024-01-15T10:30:00Z",
  "updated": "2024-01-15T10:30:00Z"
}
```

**When to run:** After updating catalogs or before collection.

### 4. `update:mongo-collect`
**File:** `chore/mongo-collect.ts`

Executes catalog queries against a specific MongoDB version.

**Usage:**
```bash
MONGO_VERSION=8.2.5 npm run update:mongo-collect
```

**Process:**
1. Loads the version's workload plan
2. Starts MongoDB container (via Docker)
3. For each catalog:
   - Creates collection with generated data and indices
   - Executes each query operation
   - Records results (matching document IDs or errors)
   - Updates metadata with completion status

**Output:** Per-catalog JSON files in `automation/collect/v{major}/{version}/`
```json
[
  {
    "operation": {"value": {"$bitsAllClear": 1}},
    "documents": [1, 2, 5, 6, 9, 10, ...]
  },
  {
    "operation": {"value": {"$bitsAllClear": -1}},
    "error": {"message": "...", "code": 2}
  }
]
```

**Metadata:** `meta.json` tracks collection history:
```json
{
  "name": "8.2.5",
  "version": "8.2.5",
  "releases": [...],
  "history": [
    {"type": "collection-completed", "date": "...", "catalog": "array", "hash": "..."}
  ]
}
```

### 5. `update:unify`
**File:** `chore/unify.ts`

Aggregates results across all collected versions to identify behavioral patterns.

**Process:**
1. Loads all meta.json files from `automation/collect/` directory
2. Filters to only fully qualified versions (major.minor.patch) - excludes aliases like "3" or "3.0"
3. Deduplicates versions that appear in multiple directories (e.g., "3.5.13" in both v3 and v4)
4. For each version, loads completed catalogs and groups results by catalog + operation + result hash
5. Sorts versions using directory order (the order they appear in the filesystem)
6. Maps each version to an index in the sorted list
7. Groups consecutive indices into ranges (e.g., indices [0,1,2,3] → "2.6.12..3.0.15")
8. Versions with the same result that are consecutive in the index list form a range

**Output:** `automation/unified.json`
```json
[
  {
    "catalog": "bitwise",
    "operation": {"value": {"$bitsAllClear": 1}},
    "results": [
      {"documents": [1, 2, 5, 6, ...], "versions": "3.6.0..7.0.16"},
      {"error": {"message": "..."}, "versions": "2.6.0..2.6.12"}
    ]
  }
]
```

**When to run:** After collecting data from multiple versions.

## Catalogs

Catalogs define test data and queries for specific MongoDB operators. Each catalog exports:

```typescript
{
  operations: Array<Query>,     // Query operations to test
  collection: {
    records: Array<Document>,   // Generated test data
    indices?: Array<Index>      // Optional indices (text, 2dsphere, etc.)
  }
}
```

### Available Catalogs

| Catalog | Operations | Records | Operators Tested |
|---------|-----------|---------|------------------|
| **array** | 23 | 20 | `$all`, `$elemMatch`, `$size` |
| **bitwise** | 69 | 30 | `$bitsAllClear`, `$bitsAllSet`, `$bitsAnyClear`, `$bitsAnySet` |
| **comparison** | 27 | 20 | `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin` |
| **element** | 43 | 20 | `$exists`, `$type` |
| **evaluation** | 26 | 20 | `$expr` comparisons |
| **expr** | 73 | 25 | `$abs`, `$add`, `$ceil`, `$divide`, `$exp`, `$floor`, `$ln`, `$log`, `$log10`, etc. |
| **geo** | 22 | 15 | `$geoIntersects`, `$geoWithin`, `$near`, `$nearSphere` |
| **logical** | 22 | 20 | `$and`, `$or`, `$nor`, `$not` |
| **misc** | 53 | 20 | Error cases, invalid operators, edge cases |
| **modulo** | 45 | 30 | `$mod` |
| **textRegex** | 44 | 25 | `$regex`, `$text` |

## Data Generation

The project uses deterministic data generators to ensure consistent test data:

```typescript
const document = compile({
  name: picker('Alice', 'Bob', 'Charlie'),
  age: number(18, 65),
  tags: several('tag1', 'tag2', 'tag3'),
})
```

Generators produce the same data for the same seed, ensuring reproducible tests across versions.

## Usage Workflow

### Initial Setup
```bash
# Install dependencies
npm install

# Discover MongoDB versions
npm run update:mongo-versions

# Register catalogs
npm run update:catalog-queries

# Create workload plans
npm run update:workload
```

### Collect Data
```bash
# Collect for a specific version
MONGO_VERSION=8.2.5 npm run update:mongo-collect

# Collect for multiple versions
MONGO_VERSION=7.0.16 npm run update:mongo-collect
MONGO_VERSION=6.0.20 npm run update:mongo-collect
```

### Analyze Results
```bash
# Unify results across versions
npm run update:unify

# Check unified output
cat automation/unified.json
```

### After Catalog Changes
```bash
# Re-register catalogs (picks up changes)
npm run update:catalog-queries

# Update workload (versions needing re-collection)
npm run update:workload

# Collect for affected versions
MONGO_VERSION=8.2.5 npm run update:mongo-collect

# Re-unify
npm run update:unify
```

## GitHub Actions Integration

The project includes a GitHub Actions workflow (`recipe.yml`) that automates the entire pipeline:

1. **Discovers** MongoDB versions from Docker Hub
2. **Registers** all catalog queries
3. **Calculates** workload prioritization
4. **Collects** data for top 5 priority versions
5. **Unifies** results across all collected versions

The workflow runs on a schedule and can be triggered manually for specific versions using the `MONGO_VERSION` input.

## Version Support

Mongo Catalog supports MongoDB versions 2.6 through 8.x using multiple driver versions:
- mongodb2 (driver 2.x) for MongoDB 2.6
- mongodb3 (driver 3.x) for MongoDB 3.0-3.6
- mongodb4 (driver 4.x) for MongoDB 4.0-4.4
- mongodb5 (driver 5.x) for MongoDB 5.0-5.1
- mongodb6 (driver 6.x) for MongoDB 5.2-6.0
- mongodb7 (driver 7.x) for MongoDB 6.1-7.x
- mongodb7 also for MongoDB 8.x (current)

## License

ISC
