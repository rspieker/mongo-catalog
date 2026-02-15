import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { Version } from '../source/domain/version';

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

const automation = resolve(__dirname, '..', 'automation');

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

function compressVersions(versions: string[]): string {
    const sorted = [...new Set(versions)].sort((a, b) => 
        normalizeVersion(a) - normalizeVersion(b)
    );

    if (sorted.length === 0) return '';
    if (sorted.length === 1) return sorted[0];

    const ranges: string[][] = [];
    let current: string[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
        const prevNorm = normalizeVersion(sorted[i - 1]);
        const currNorm = normalizeVersion(sorted[i]);
        
        if (currNorm === prevNorm + 1) {
            current.push(sorted[i]);
        } else {
            ranges.push(current);
            current = [sorted[i]];
        }
    }
    ranges.push(current);

    return ranges.map(range => {
        if (range.length === 1) return range[0];
        return `${range[0]}..${range[range.length - 1]}`;
    }).join(',');
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
    console.log('Finding version directories...');
    const versionDirs = await findVersionDirs();
    console.log(`Found ${versionDirs.length} version directories`);

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
