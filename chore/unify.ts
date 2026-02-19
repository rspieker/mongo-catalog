import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { Version } from '../source/domain/version';
import { glob } from 'glob';

type Result = 
    | { documents: unknown[] }
    | { error: unknown };

type OperationResult = {
    version: string;
    result: Result;
};

type UnifiedResult = {
    documents?: unknown[];
    error?: unknown;
    versions: string;
};

type UnifiedEntry = {
    catalog: string;
    operation: unknown;
    results: UnifiedResult[];
};

type MetaData = {
    name: string;
    version: string;
    releases: Array<{ name: string; [key: string]: unknown }>;
    history: Array<{ type: string; date: string; [key: string]: unknown }>;
};

const automation = resolve(__dirname, '..', 'automation');

// Global sorted list of all versions from all meta.json files
let globalVersionList: string[] = [];

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => deepEqual(val, b[i]));
    }
    
    if (typeof a === 'object' && typeof b === 'object') {
        const aKeys = Object.keys(a as object);
        const bKeys = Object.keys(b as object);
        if (aKeys.length !== bKeys.length) return false;
        return aKeys.every(key => deepEqual(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key]
        ));
    }
    
    return false;
}

function getResultKey(result: Result): string {
    if ('documents' in result) {
        const docs = (result.documents as unknown[]).slice().sort();
        return JSON.stringify({ documents: docs });
    }
    return JSON.stringify({ error: result.error });
}

function normalizeVersion(version: string): number {
    const v = Version.from(version);
    const major = v.major;
    const minor = v.minor ?? 0;
    const patch = v.patch ?? 0;
    return major * 10000 + minor * 100 + patch;
}

async function buildGlobalVersionList(): Promise<string[]> {
    const metaFiles = await glob(resolve(automation, 'collect', '**', 'meta.json'));
    const versionSet = new Set<string>();
    
    for (const file of metaFiles) {
        try {
            const content = await readFile(file, 'utf-8');
            const meta = JSON.parse(content) as MetaData;
            if (meta.version) {
                versionSet.add(meta.version);
            }
        } catch {
            // Skip files that can't be read/parsed
        }
    }
    
    // Sort using Version class for proper ordering
    const sorted = Array.from(versionSet).sort((a, b) => {
        const vA = Version.from(a);
        const vB = Version.from(b);
        
        // Compare major
        if (vA.major !== vB.major) return vA.major - vB.major;
        // Compare minor (treat undefined as 0)
        const minorA = vA.minor ?? 0;
        const minorB = vB.minor ?? 0;
        if (minorA !== minorB) return minorA - minorB;
        // Compare patch (treat undefined as 0)
        const patchA = vA.patch ?? 0;
        const patchB = vB.patch ?? 0;
        return patchA - patchB;
    });
    
    return sorted;
}

function compressVersions(versions: string[]): string {
    if (versions.length === 0) return '';
    if (versions.length === 1) return versions[0];
    
    // Sort collected versions
    const sorted = [...new Set(versions)].sort((a, b) => 
        normalizeVersion(a) - normalizeVersion(b)
    );
    
    // Find first and last collected version in global list
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    // If same, return single version
    if (first === last) return first;
    
    // Return range from first to last, spanning uncollected versions
    return `${first}..${last}`;
}

async function findVersionDirs(): Promise<string[]> {
    const collectDir = resolve(automation, 'collect');
    const majorDirs = await readdir(collectDir, { withFileTypes: true });
    
    const versionDirs: string[] = [];
    
    for (const majorDir of majorDirs) {
        if (!majorDir.isDirectory()) continue;
        if (!majorDir.name.startsWith('v')) continue;
        
        const majorPath = resolve(collectDir, majorDir.name);
        const versionSubdirs = await readdir(majorPath, { withFileTypes: true });
        
        for (const versionDir of versionSubdirs) {
            if (!versionDir.isDirectory()) continue;
            versionDirs.push(resolve(majorPath, versionDir.name));
        }
    }
    
    return versionDirs;
}

async function loadCatalogsForVersion(versionDir: string): Promise<{
    version: string;
    catalog: string;
    operation: unknown;
    result: Result;
}[]> {
    const version = versionDir.split('/').pop()!;
    const files = await readdir(versionDir);
    const results: {
        version: string;
        catalog: string;
        operation: unknown;
        result: Result;
    }[] = [];
    
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        if (file === 'meta.json' || file === 'plan.json') continue;
        
        const catalog = file.replace('.json', '');
        const content = await readFile(resolve(versionDir, file), 'utf-8');
        const operations = JSON.parse(content) as Array<{
            operation: unknown;
            documents?: unknown[];
            error?: unknown;
        }>;
        
        for (const op of operations) {
            if (op.error) {
                results.push({
                    version,
                    catalog,
                    operation: op.operation,
                    result: { error: op.error },
                });
            } else {
                results.push({
                    version,
                    catalog,
                    operation: op.operation,
                    result: { documents: op.documents ?? [] },
                });
            }
        }
    }
    
    return results;
}

async function unify(): Promise<void> {
    console.log('Building global version list...');
    globalVersionList = await buildGlobalVersionList();
    console.log(`Found ${globalVersionList.length} unique versions`);
    
    console.log('Finding version directories...');
    const versionDirs = await findVersionDirs();
    console.log(`Found ${versionDirs.length} version directories with collected data`);

    if (versionDirs.length === 0) {
        console.log('No versions found, exiting');
        return;
    }

    console.log('Loading catalog results...');
    const allResults: Awaited<ReturnType<typeof loadCatalogsForVersion>> = [];
    
    for (const dir of versionDirs) {
        const results = await loadCatalogsForVersion(dir);
        allResults.push(...results);
    }
    
    console.log(`Loaded ${allResults.length} operation results`);

    console.log('Grouping results...');
    const grouped = new Map<string, Map<string, OperationResult[]>>();
    
    for (const item of allResults) {
        const key = `${item.catalog}\0${JSON.stringify(item.operation)}`;
        const resultKey = getResultKey(item.result);
        
        if (!grouped.has(key)) {
            grouped.set(key, new Map());
        }
        
        const operationMap = grouped.get(key)!;
        if (!operationMap.has(resultKey)) {
            operationMap.set(resultKey, []);
        }
        
        operationMap.get(resultKey)!.push({
            version: item.version,
            result: item.result,
        });
    }

    console.log(`Grouped into ${grouped.size} unique operations`);

    console.log('Building unified output...');
    const unified: UnifiedEntry[] = [];
    
    for (const [key, operationMap] of grouped) {
        const nullIndex = key.indexOf('\0');
        const catalog = key.slice(0, nullIndex);
        const opStr = key.slice(nullIndex + 1);
        const operation = JSON.parse(opStr);
        
        const results: UnifiedResult[] = [];
        
        for (const [, versions] of operationMap) {
            const versionList = versions.map(v => v.version);
            const compressed = compressVersions(versionList);
            
            const firstResult = versions[0].result;
            if ('documents' in firstResult) {
                results.push({
                    documents: firstResult.documents as unknown[],
                    versions: compressed,
                });
            } else {
                results.push({
                    error: firstResult.error,
                    versions: compressed,
                });
            }
        }
        
        results.sort((a, b) => {
            const aVersions = a.versions.split(',').map(v => normalizeVersion(v.split('..')[0]));
            const bVersions = b.versions.split(',').map(v => normalizeVersion(v.split('..')[0]));
            return Math.min(...aVersions) - Math.min(...bVersions);
        });
        
        unified.push({
            catalog,
            operation,
            results,
        });
    }

    unified.sort((a, b) => {
        if (a.catalog !== b.catalog) return a.catalog.localeCompare(b.catalog);
        return JSON.stringify(a.operation).localeCompare(JSON.stringify(b.operation));
    });

    const outputPath = resolve(automation, 'unified.json');
    await writeFile(outputPath, JSON.stringify(unified, null, '\t'));
    console.log(`Written to ${outputPath}`);
}

unify().catch(console.error);
