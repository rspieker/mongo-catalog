# Chore Documentation

This document provides detailed explanations of the chore scripts in `/chore/`, their flows, and logic.

## Overview

The chores work sequentially to maintain a catalog of MongoDB query results across different MongoDB versions:

```
mongo-docker-images → catalog-queries → workload → mongo-collect
```

---

## 1. mongo-docker-images.ts

**Command:** `npm run update:mongo-versions`

**Purpose:** Collects and tracks all MongoDB Docker image versions from Docker Hub.

### Flow

1. **Fetch Tags from Docker Hub**
   - Calls Docker Hub API to get all MongoDB tags
   - Filters for Linux amd64 architecture only
   - Only keeps stable versions (no build metadata) and release candidates (`-rcN`)

2. **Group by Version/Digest**
   - Groups tags that share the same version or Docker digest
   - Multiple tags can point to the same image (e.g., `3.3.0` and `3.3` both point to `3.3.15`)
   - Uses the longest/normalized version string as the canonical name

3. **Update Metadata**
   - Reads existing `automation/collect/v<major>/<version>/meta.json` files
   - Compares current releases with newly fetched releases
   - Detects ADDED, REMOVED, or UPDATED releases
   - Maintains a history log of all changes

### Output

Creates/updates `meta.json` for each MongoDB version:
- `name`: Canonical version name
- `version`: Version string
- `catalog`: Array of catalog entries (empty initially)
- `releases`: Array of Docker tags for this version
- `history`: Chronological log of all changes

---

## 2. catalog-queries.ts

**Command:** `npm run update:catalog-queries`

**Purpose:** Discovers and tracks all catalog query definitions from the TypeScript source files.

### Flow

1. **Scan Catalog Directory**
   - Uses `glob` to find all `.ts` files in `/catalog/query/`

2. **Inspect Exports**
   - Dynamically imports each TypeScript file
   - Examines all exports (except `default` and `__esModule`)
   - Identifies Catalog objects by checking for `operations` or `collection` properties

3. **Calculate Hashes**
   - Creates a SHA256 hash of each export's value
   - Used to detect when query definitions change

4. **Track Changes**
   - Compares against previous state in `automation/catalog-queries.json`
   - Records INITIAL for new exports
   - Records UPDATE when hash changes
   - Notes removed exports

### Output

Creates/updates `automation/catalog-queries.json`:
```json
[
  {
    "name": "filename",
    "path": "relative/path/to/file.ts",
    "exports": [
      {
        "name": "exportName",
        "type": "Catalog",
        "hash": "sha256-hash"
      }
    ],
    "update": [
      {
        "type": "INITIAL|UPDATE",
        "date": "ISO timestamp",
        "exportName": "name",
        "before": "previous hash (for UPDATE)"
      }
    ]
  }
]
```

---

## 3. workload.ts

**Command:** `npm run update:workload`

**Purpose:** Determines which MongoDB versions need query execution and prioritizes them for the CI/CD matrix.

### Flow

1. **Load Catalogs**
   - Reads `catalog-queries.json` to get all available catalog definitions
   - Flattens exports into a list of work items (name, path, hash)

2. **Load Meta Files**
   - Scans all `automation/collect/**/meta.json` files
   - For each version:
     - Checks which catalogs are pending (not in meta, or hash changed, or previously failed)
     - Creates/updates `plan.json` with pending catalogs
     - Skips versions marked with `skip: true` in meta.json

3. **Binary Search Prioritization**
   
   Groups versions by major.minor (e.g., `4.4`, `5.0`, `6.0`) and uses a smart bisection algorithm:
   
   **For each group:**
   - Priority 1: Latest version (always tested first)
   - Priority 2: Earliest version
   - Check if latest and earliest have matching results (via checksum)
     - If match: All middle versions are identical → skip them (priority 1000)
     - If differ: Bisect to find the boundary
   
   **Bisection Logic:**
   ```
   If middle version has pending work → STOP (needs testing)
   If middle matches both start and end → SKIP range (all identical)
   Otherwise → Recursively bisect both halves
   ```

4. **Global Sorting**
   - Sorts all versions globally by priority
   - Tie-breaker: Higher version numbers first (newer versions prioritized)

### Output

- Updates `plan.json` for each version:
  ```json
  {
    "name": "docker-tag-name",
    "version": "major.minor.patch",
    "catalogs": [
      { "name": "catalogName", "path": "path.ts", "hash": "sha256" }
    ],
    "created": "timestamp",
    "updated": "timestamp"
  }
  ```

- Outputs to stdout (captured by GitHub Actions):
  ```json
  ["8.0.3", "7.0.15", "6.0.19", "5.0.29", "4.4.29"]
  ```
  (Top 5 versions with pending work, sorted by priority)

---

## 4. mongo-collect.ts

**Command:** `npm run update:mongo-collect`

**Purpose:** Executes pending catalogs against a specific MongoDB Docker container and records results.

### Flow

1. **Load Plan**
   - Reads `plan.json` for the specified version (from `MONGO_VERSION` env var)
   - Exits early if no plan or no pending catalogs

2. **Connect to MongoDB**
   - Uses the appropriate MongoDB driver based on version (v2-v7)
   - Connects to the running Docker container

3. **Process Each Catalog**
   
   For each pending catalog:
   
   **a. Load Catalog Module**
   - Dynamically imports the TypeScript file
   - Extracts the named export
   
   **b. Initialize Collection**
   - Creates collection in MongoDB
   - Inserts test documents
   - Creates indexes if specified
   
   **c. Execute Operations**
   - Runs each query operation
   - Captures:
     - Matched documents (on success)
     - Error messages (on failure)
   
   **d. Cleanup**
   - Drops the test collection
   
   **e. Save Results**
   - Writes results to `<catalog-name>.json`
   - Calculates checksum of results
   - Updates meta.json entry:
     - `completed`: ISO timestamp
     - `resultChecksum`: SHA256 of results

4. **Update Metadata**
   - Clears all catalogs from plan.json (marking as processed)
   - Updates plan timestamp
   - Calculates combined checksum from all completed catalogs
   - Updates meta.json:
     - `resultChecksum`: Combined hash
     - `completedCount`: Number of completed catalogs
     - `totalCount`: Total catalogs expected

5. **Staging**
   - Copies version directory to `/tmp/mongo-catalog-changes` for artifact upload

### Error Handling

- **Catalog Loading Errors**: Recorded in meta.json with `failed` status
- **Execution Errors**: Recorded with error message and stack trace
- Process exits with code 1 if any errors occurred

### Output

- `<catalog-name>.json`: Query results for each catalog
- Updated `plan.json`: Empty catalogs array
- Updated `meta.json`: Completion status and checksums

---

## 5. backfill-checksums.ts

**Command:** `ts-node chore/backfill-checksums.ts`

**Purpose:** One-time utility to add checksums to existing meta.json files for efficient version comparison.

### Flow

1. **Scan Meta Files**
   - Finds all `automation/collect/**/meta.json` files

2. **Calculate Checksums**
   - For each completed catalog:
     - Reads the result file (`<catalog-name>.json`)
     - Calculates SHA256 checksum
     - Stores in `meta.catalog[].resultChecksum`
   
   - Calculates combined checksum:
     - Concatenates all `name:checksum` pairs
     - Sorts alphabetically for consistency
     - Hashes the joined string

3. **Update Metadata**
   - Stores combined checksum in `meta.resultChecksum`
   - Records `completedCount` and `totalCount`

### Options

- `--dry-run`: Preview changes without writing files
- `--force`: Recalculate checksums even if already present

### Output

Updates each `meta.json` with:
- Individual `resultChecksum` for each catalog entry
- Combined `resultChecksum` for the entire version
- `completedCount`: Number of successful catalogs
- `totalCount`: Total number of catalogs

---

## Data Flow Summary

```
Docker Hub                    Catalog Files
     |                             |
     v                             v
[ mongo-docker-images ]    [ catalog-queries ]
     |                             |
     v                             v
meta.json (versions)        catalog-queries.json
     |                             |
     +-------------+---------------+
                   |
                   v
            [ workload ]
                   |
                   v
            plan.json (pending)
                   |
                   v
            [ mongo-collect ]
                   |
       +-----------+-----------+
       |                       |
       v                       v
<name>.json              meta.json (updated)
(results)                (status + checksums)
```

## Checksum Strategy

The system uses checksums for efficient comparison:

1. **Per-Catalog Checksum**: SHA256 of the query results JSON
   - Detects when behavior changes for specific queries
   - Stored in `meta.catalog[].resultChecksum`

2. **Combined Checksum**: SHA256 of sorted `name:checksum` pairs
   - Quickly compares entire MongoDB version behavior
   - Enables binary search optimization in workload.ts
   - Stored in `meta.resultChecksum`

This allows `workload.ts` to:
- Skip versions identical to already-tested versions
- Focus testing on versions that might have behavioral differences
- Efficiently prioritize using bisection
