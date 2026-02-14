/**
 * Meta Migration Script
 *
 * One-time migration to convert old meta.json format to new format:
 * - Removes: catalog array, resultChecksum, completedCount, totalCount, skip flag
 * - Adds: flattened history with DISCOVERED, RETRACTED, PROCESSED, FAILED types
 * - Transforms: INITIAL/UPDATE → DISCOVERED/RETRACTED, SKIP → FAILED
 *
 * Usage:
 *   ts-node chore/migrate-meta.ts           # Run migration
 *   ts-node chore/migrate-meta.ts --dry-run # Preview changes
 */

import { resolve, dirname } from 'node:path';
import { glob } from 'glob';
import { readFile, writeFile } from 'node:fs/promises';

interface OldMetaCatalogEntry {
    name: string;
    hash: string;
    completed?: string;
    failed?: string;
    error?: string;
    resultChecksum?: string;
}

interface OldHistoryAction {
    type: string;
    reason?: string;
    date: string;
    version?: string;
    name?: string;
    digest?: string;
    before?: any;
}

interface OldHistoryEntry {
    type: 'INITIAL' | 'UPDATE' | 'SKIP';
    date: string;
    actions?: OldHistoryAction[];
}

interface OldMetaFile {
    name: string;
    version: string;
    catalog: OldMetaCatalogEntry[];
    releases: Array<{ name: string; version: string; digest: string; released: string }>;
    resultChecksum?: string;
    completedCount?: number;
    totalCount?: number;
    skip?: boolean;
    updated: string;
    history?: OldHistoryEntry[];
}

interface NewProcessedRecord {
    type: 'PROCESSED';
    date: string;
    catalog: string;
    hash: string;
    resultChecksum: string;
}

interface NewFailedRecord {
    type: 'FAILED';
    date: string;
    reason: string;
}

interface NewDiscoveredRecord {
    type: 'DISCOVERED';
    date: string;
    name: string;
    digest: string;
}

interface NewRetractedRecord {
    type: 'RETRACTED';
    date: string;
    name: string;
}

type NewHistoryRecord = NewProcessedRecord | NewFailedRecord | NewDiscoveredRecord | NewRetractedRecord;

interface NewMetaFile {
    name: string;
    version: string;
    releases: Array<{ name: string; version: string; digest: string; released: string }>;
    history: NewHistoryRecord[];
}

async function readJSONFile<T>(path: string): Promise<T> {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
}

async function writeJSONFile(path: string, data: unknown): Promise<void> {
    await writeFile(path, JSON.stringify(data, null, '\t'), 'utf-8');
}

function convertHistoryEntry(oldEntry: OldHistoryEntry): NewHistoryRecord[] {
    const records: NewHistoryRecord[] = [];

    if (oldEntry.type === 'INITIAL' || oldEntry.type === 'UPDATE') {
        // Convert actions to DISCOVERED/RETRACTED records
        if (oldEntry.actions) {
            for (const action of oldEntry.actions) {
                if (action.type === 'ADDED' && action.name && action.digest) {
                    records.push({
                        type: 'DISCOVERED',
                        date: action.date || oldEntry.date,
                        name: action.name,
                        digest: action.digest
                    });
                } else if (action.type === 'REMOVED' && action.name) {
                    records.push({
                        type: 'RETRACTED',
                        date: action.date || oldEntry.date,
                        name: action.name
                    });
                }
                // UPDATED actions are ignored - the new format doesn't track modifications
            }
        }
    } else if (oldEntry.type === 'SKIP') {
        // Convert SKIP entry to FAILED record
        // Use the reason from the first action if available, otherwise generic
        const reason = oldEntry.actions?.[0]?.reason || 'mongodb-start-failed';
        records.push({
            type: 'FAILED',
            date: oldEntry.date,
            reason
        });
    }

    return records;
}

function convertCatalogEntries(catalog: OldMetaCatalogEntry[]): NewProcessedRecord[] {
    const records: NewProcessedRecord[] = [];

    for (const entry of catalog) {
        if (entry.completed && entry.resultChecksum) {
            records.push({
                type: 'PROCESSED',
                date: entry.completed,
                catalog: entry.name,
                hash: entry.hash,
                resultChecksum: entry.resultChecksum
            });
        }
        // Failed entries are not converted - they should be handled via FAILED history records
        // But in the old format, failed catalog entries weren't recorded in history
    }

    return records;
}

async function migrateMetaFile(oldMeta: OldMetaFile): Promise<NewMetaFile> {
    const newHistory: NewHistoryRecord[] = [];

    // Convert old history entries
    if (oldMeta.history) {
        for (const oldEntry of oldMeta.history) {
            const converted = convertHistoryEntry(oldEntry);
            newHistory.push(...converted);
        }
    }

    // Convert catalog entries to PROCESSED records
    const processedRecords = convertCatalogEntries(oldMeta.catalog);
    newHistory.push(...processedRecords);

    // Sort history by date
    newHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
        name: oldMeta.name,
        version: oldMeta.version,
        releases: oldMeta.releases,
        history: newHistory
    };
}

async function migrateAllMetaFiles(): Promise<void> {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    if (dryRun) {
        console.log('Running in DRY-RUN mode (no files will be modified)');
    }

    const automationDir = resolve(process.cwd(), 'automation');
    const metaFiles = await glob(resolve(automationDir, 'collect', '**', 'meta.json'));

    console.log(`Found ${metaFiles.length} meta.json files to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const metaFile of metaFiles) {
        try {
            const oldMeta = await readJSONFile<OldMetaFile>(metaFile);

            // Check if already in new format (no catalog array means new format)
            if (!oldMeta.catalog) {
                console.log(`  Skipping ${oldMeta.name} - already in new format`);
                skipped++;
                continue;
            }

            const newMeta = await migrateMetaFile(oldMeta);

            if (!dryRun) {
                await writeJSONFile(metaFile, newMeta);
            }

            const processedCount = newMeta.history.filter(h => h.type === 'PROCESSED').length;
            const failedCount = newMeta.history.filter(h => h.type === 'FAILED').length;
            const discoveredCount = newMeta.history.filter(h => h.type === 'DISCOVERED').length;

            console.log(`  ${dryRun ? '[DRY-RUN] Would migrate' : 'Migrated'} ${oldMeta.name}: ${processedCount} processed, ${failedCount} failed, ${discoveredCount} discovered`);
            migrated++;

        } catch (error) {
            console.error(`  Error processing ${metaFile}: ${error}`);
            errors++;
        }
    }

    console.log('\nMigration complete:');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Errors:   ${errors}`);
}

migrateAllMetaFiles().catch(console.error);
