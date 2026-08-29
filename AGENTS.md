# AGENTS.md - mongo-catalog

This file provides persistent context for AI assistants working on the mongo-catalog project.

## Project Goal

Collect query results (matched documents and errors) from various MongoDB versions to create a behavioral reference database. This data is used in another project to test a TypeScript MongoDB query filter implementation against real MongoDB behavior.

## Core Workflow

The project runs on a split set of GitHub Actions workflows, not a single pipeline — see `## GitHub Actions` below for the current workflow files, and [docs/FREQUENCY.md](./docs/FREQUENCY.md) for exact cadence and rate-limit reasoning.

For full mechanics of each chore below (exact data shapes, the bisection decision tree, checksum strategy), see [docs/CHORES.md](./docs/CHORES.md) — treat it as the source of truth over this summary.

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
   - Outputs the prioritized batch of versions (`BATCH_SIZE`, currently 15 — see docs/FREQUENCY.md) for the GH Actions matrix

4. **`mongo-collect.ts`** (`npm run update:mongo-collect`)
   - Run per MongoDB version against a Dockerized MongoDB instance
   - Reads `plan.json` for the version
   - Executes all catalog queries
   - Removes processed catalogs from plan.json
   - Archives results in version's `meta.json`

5. **`unify.ts`** (`npm run update:unify`)
   - Loads every version's completed catalog results
   - Groups identical results across consecutive versions into ranges
   - Writes the cross-version summary to `automation/unified.json`

**Not part of the regular sequence:** `backfill-checksums.ts` is a one-time utility for backfilling `resultChecksum` on existing `meta.json` files; it's run manually, not on a schedule.

**Also feeding the catalog registry, on its own schedule:** the coverage pipeline (`scripts/fingerprint.ts` → `scripts/detect-gaps.ts` → `scripts/generate-coverage.ts`) pulls `mongo-test-extractor`'s jstest extraction, finds query shapes not yet covered by hand-written catalogs, and writes/updates JSON data in `automation/coverage/*.json`. Driven by `.github/workflows/update-coverage.yml` (Wed/Sat), independent of the chore order above.

Each `catalog/query/coverage/<topic>.ts` file is a thin wrapper that reads its matching `automation/coverage/<topic>.json` at import time (see `catalog/query/coverage/mod.ts` for the pattern) — so the pipeline updating the JSON is enough to change what gets tested, without touching the `.ts` file. A genuinely new topic (no existing wrapper) needs one scaffolded once via `scripts/scaffold-coverage.ts` or `scripts/process-gaps.ts` — that step is manual, not run by `update-coverage.yml`.

## Directory Structure

```
/chore/                    # Workflow scripts (run in order above)
/scripts/                  # Coverage pipeline scripts (fingerprint, detect-gaps, generate-coverage, scaffold-coverage)
/docs/
  CHORES.md                # Chore-by-chore mechanics — treat as source of truth over this file
  FREQUENCY.md             # Workflow cadence, rate limits, BATCH_SIZE derivation
/source/                   # Domain logic
  /domain/
    /mongo/driver/         # MongoDB driver adapters (v2-v7)
    /generator/            # Test data generation
    /coverage/             # Fingerprinting, gap detection, coverage catalog generation
/catalog/
  /query/
    /common/               # Shared query operators (comparison, logical, array, etc.) — registered
    /coverage/             # Thin wrappers reading automation/coverage/*.json — registered (see coverage pipeline above)
    /comparison/           # $eq, $gt, $ne, etc. — NOT registered (only export a bare `operations` array,
                           # no `collection`; catalog-queries.ts skips them). Orphaned, don't add to this dir.
  catalog.ts               # Type definitions for catalogs
/automation/                # Fully git-tracked — not gitignored
  catalog-queries.json      # Registered catalogs
  unified.json              # Cross-version unified results
  /coverage/                # Auto-generated coverage catalog JSON
  /collect/
    /v<major>/             # Grouped by major version
      /<major>.<minor>.<patch>/
        meta.json          # Version metadata and historical results
        plan.json          # Pending queries to execute (temporary)
```

## Adding New Queries

To add a query to the catalog:

1. Create/modify a TypeScript file in `/catalog/query/common/` (not `/comparison/` — see above)
2. Give it a **named** export (`catalog-queries.ts` explicitly skips `default` exports) shaped as a `Catalog` from `catalog/catalog.ts`
3. The export must have `operations` and/or `collection` for `catalog-queries.ts` to recognize it as a catalog at all — a file with only `operations` and no `collection` (like the orphaned `/comparison/` files) won't be registered
4. Optionally include `description` and `category`

Example structure:
```typescript
import type { Catalog } from '../../catalog';

export const gt: Catalog<{ name: string; age: number }> = {
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

After adding or changing a catalog file, run `npm run update:catalog-queries` and check the new/changed entry actually shows up in `automation/catalog-queries.json` before assuming it's wired in.

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

The pipeline is split into several workflows — there is no single `recipe.yml`:

- **`versions.yml`** — on push to `catalog/**`/`source/**`/`.github/workflows/**`, and Sun/Wed/Sat 07:00 UTC. Runs `update:mongo-versions` + `update:catalog-queries`.
- **`scheduler.yml`** — hourly, plus an extra `:30` run on weekends. Runs `update:workload`; only calls `catalog.yml` if there's pending work, to avoid spinning up the matrix for nothing.
- **`catalog.yml`** — called by `scheduler.yml` or manually. Computes the batch, runs `update:mongo-collect` per version in a matrix job (`max-parallel: 15`).
- **`update-coverage.yml`** — Wed/Sat 07:00 UTC. Runs the coverage pipeline against the latest `mongo-test-extractor` release.
- **`commit.yml`** — reusable, called by the workflows above. Runs `update:unify`, then commits and pushes `automation/`.

Artifacts (not shared state files) pass data between jobs within a workflow. See [docs/FREQUENCY.md](./docs/FREQUENCY.md) for exact cadence and how `BATCH_SIZE = 15` was derived from Docker Hub/GitHub Actions rate limits.

### Skip-on-Failure System

There is no `skip: true` boolean field. Instead, `catalog.yml`'s per-version `Gate` step appends a `collection-halted` history entry (with a `reason`) to the version's `meta.json` on failure. `workload.ts` derives skip state from history at read time:

1. **`getSkipInfo`** walks the version's `history` backwards from the end; as long as entries are consecutively `collection-halted`, it's "in a failure sequence," and the *first* entry in that consecutive run gives the failure-sequence start date.
2. **`shouldRetrySkip`** applies exponential backoff from that start date: 1, 2, 4, 8, 16... days (`2^(failureCount-1)`).
3. **Stale-failure bypass**: if the catalog that caused the failure has since changed (new hash pending), the version is eligible again immediately, without waiting out the backoff.
4. **Implicit unskip**: a successful `mongo-collect` run appends a non-`collection-halted` history entry, which breaks the consecutive run `getSkipInfo` walks back through — there's nothing to explicitly clear.

This prevents the workflow from getting stuck on persistently failing versions while still giving them retry opportunities. Full logic in `chore/workload.ts` (`getSkipInfo`, `shouldRetrySkip`); rationale for the backoff/batch numbers in [docs/FREQUENCY.md](./docs/FREQUENCY.md).

## Testing Approach

This is NOT a test suite itself - it's a data collection service that:
1. Runs queries against real MongoDB Docker containers
2. Records actual results (matched documents, errors, edge cases)
3. Provides reference data for downstream testing libraries

## Notes for AI Assistants

- Always maintain chore execution order when making changes
- New hand-written query operators go in `/catalog/query/common/`, as a named export with `operations`/`collection` — not `/catalog/query/comparison/`, which is orphaned dead code that `catalog-queries.ts` doesn't register
- Driver adapters should be updated if MongoDB driver APIs change
- Version comparison uses custom `Version` class (see `/source/domain/version.ts`)
- Docker digest changes indicate image updates requiring re-collection
