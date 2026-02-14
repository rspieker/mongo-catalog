# AGENTS.md - mongo-catalog

This file provides persistent context for AI assistants working on the mongo-catalog project.

## Project Goal

Collect query results (matched documents and errors) from various MongoDB versions to create a behavioral reference database. This data is used in another project to test a TypeScript MongoDB query filter implementation against real MongoDB behavior.

## Core Workflow

The project runs periodically via GitHub Actions (`.github/workflows/recipe.yml`) to collect data across MongoDB versions.

### Chore Execution Order (Sequential)

Chores in `/chore/` must run in this specific order:

1. **`mongo-docker-images.ts`** (`npm run update:mongo-versions`)
   - Fetches all MongoDB versions from Docker Hub
   - Groups versions by Docker image digest
   - Stores metadata in `automation/collect/v<major>/<major>.<minor>.<patch>/meta.json`

2. **`catalog-queries.ts`** (`npm run update:catalog-queries`)
   - Traverses `/catalog/query/` for TypeScript files containing queries
   - Collects queries and their test collections
   - Updates catalog index

3. **`workload.ts`** (`npm run update:workload`)
   - Detects which MongoDB versions need updates
   - Checks: missing catalogs, out-of-date catalogs, new MongoDB versions, digest changes
   - Creates `plan.json` for versions needing work
   - Outputs prioritized list of 5 versions for GH Action matrix

4. **`mongo-collect.ts`** (`npm run update:mongo-collect`)
   - Run per MongoDB version against a Dockerized MongoDB instance
   - Reads `plan.json` for the version
   - Executes all catalog queries
   - Removes processed catalogs from plan.json
   - Archives results in version's `meta.json`

## Directory Structure

```
/chore/                    # Workflow scripts (run in order above)
/source/                   # Domain logic
  /domain/
    /mongo/driver/         # MongoDB driver adapters (v2-v7)
    /generator/            # Test data generation
/catalog/
  /query/
    /common/               # Shared query operators (comparison, logical, array, etc.)
    /comparison/           # Specific comparison operators ($eq, $gt, $ne, etc.)
  catalog.ts               # Type definitions for catalogs
/automation/
  /collect/
    /v<major>/             # Grouped by major version
      /<major>.<minor>.<patch>/
        meta.json          # Version metadata and historical results
        plan.json          # Pending queries to execute (temporary)
```

## Adding New Queries

To add a query to the catalog:

1. Create/modify a TypeScript file in `/catalog/query/` (e.g., `/catalog/query/comparison/$regex.ts`)
2. Export a `Catalog` object following the type in `catalog/catalog.ts`
3. Include:
   - `description`: What this query tests
   - `category`: Query operator category
   - `operations`: Array of MongoDB query objects
   - `collection`: Test documents and optional index definitions

Example structure:
```typescript
import type { Catalog } from '../../catalog';

export default <Catalog<{ name: string; age: number }>>{
  description: 'Test $gt operator on numbers',
  category: 'comparison',
  operations: [
    { age: { $gt: 21 } },
    { age: { $gt: 30 } }
  ],
  collection: {
    records: [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ]
  }
};
```

## Key Files

- `/source/domain/mongo/driver/` - Driver version adapters (v2 through v7)
- `/source/domain/generator/` - Test data generation utilities
- `/source/domain/version.ts` - Version parsing and comparison
- `/source/versions.ts` - Docker tag processing and version management

## Multi-Version Support

The project tests against multiple MongoDB driver versions (v2-v7) simultaneously:
- Dependencies aliased: `mongodb2`, `mongodb3`, ..., `mongodb7`
- Driver adapters in `/source/domain/mongo/driver/v{2-7}.ts`

## GitHub Actions

Workflow: `.github/workflows/recipe.yml`
- Runs every 2 hours (cron schedule)
- Jobs: setup → workload → collect-versions (matrix) → commit-results
- Artifacts passed between jobs for state management

## Testing Approach

This is NOT a test suite itself - it's a data collection service that:
1. Runs queries against real MongoDB Docker containers
2. Records actual results (matched documents, errors, edge cases)
3. Provides reference data for downstream testing libraries

## Notes for AI Assistants

- Always maintain chore execution order when making changes
- New query operators go in appropriate `/catalog/query/` subdirectory
- Driver adapters should be updated if MongoDB driver APIs change
- Version comparison uses custom `Version` class (see `/source/domain/version.ts`)
- Docker digest changes indicate image updates requiring re-collection
