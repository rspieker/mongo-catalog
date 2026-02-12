/**
 * Backfill Checksums Script
 *
 * This script reads all meta.json files in automation/collect/** and adds
 * result checksums for efficient comparison between MongoDB versions.
 *
 * It calculates and stores:
 * - Per-catalog resultChecksum: Individual checksum of each catalog's results
 * - Combined resultChecksum: Hash of all catalog:checksum pairs (for quick comparison)
 * - completedCount: Number of completed catalogs
 * - totalCount: Total number of catalogs expected
 *
 * Usage:
 *   ts-node chore/backfill-checksums.ts           # Normal run
 *   ts-node chore/backfill-checksums.ts --dry-run # Preview changes
 *   ts-node chore/backfill-checksums.ts --force   # Recalculate all
 */

import { resolve, dirname } from 'node:path';
import { glob } from 'glob';
import { readFile, writeFile } from 'node:fs/promises';
import { hash } from '@konfirm/checksum';

interface MetaCatalogEntry {
	name: string;
	hash: string;
	completed?: string;
	failed?: string;
	error?: string;
	resultChecksum?: string;
}

interface MetaFile {
	name: string;
	version: string;
	catalog: MetaCatalogEntry[];
	releases: Array<{ name: string; [key: string]: unknown }>;
	resultChecksum?: string;
	completedCount?: number;
	totalCount?: number;
}

async function readJSONFile<T>(path: string): Promise<T> {
	const content = await readFile(path, 'utf-8');
	return JSON.parse(content) as T;
}

async function writeJSONFile(path: string, data: unknown): Promise<void> {
	await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

async function backfillMetaChecksums(): Promise<void> {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const force = args.includes('--force');

	if (dryRun) {
		console.log('Running in DRY-RUN mode (no files will be modified)');
	}

	const automationDir = resolve(process.cwd(), 'automation');
	const metaFiles = await glob(resolve(automationDir, 'collect', '**', 'meta.json'));

	console.log(`Found ${metaFiles.length} meta.json files to process`);

	let updated = 0;
	let skipped = 0;
	let errors = 0;

	for (const metaFile of metaFiles) {
		try {
			const versionDir = dirname(metaFile);
			const meta = await readJSONFile<MetaFile>(metaFile);

			// Skip if no catalogs present
			if (!meta.catalog || meta.catalog.length === 0) {
				console.log(`  Skipping ${meta.name} - no catalogs present`);
				skipped++;
				continue;
			}

			// Skip if already has checksum (unless --force is used)
			if (!force && meta.resultChecksum && meta.completedCount !== undefined && meta.totalCount !== undefined) {
				console.log(`  Skipping ${meta.name} - already has checksum (use --force to recalculate)`);
				skipped++;
				continue;
			}

			const totalCount = meta.catalog.length;
			let completedCount = 0;
			const completedChecksums: { name: string; resultChecksum: string }[] = [];

			// Update each catalog entry with its individual checksum
			for (const entry of meta.catalog) {
				if (entry.completed) {
					try {
						const resultFile = resolve(versionDir, `${entry.name}.json`);
						const resultData = await readJSONFile<unknown>(resultFile);
						const resultChecksum = hash(resultData);
						
						// Store checksum in the entry itself
						entry.resultChecksum = resultChecksum;
						completedChecksums.push({
							name: entry.name,
							resultChecksum
						});
						completedCount++;
					} catch (error) {
						console.warn(`    Warning: Could not read result file for ${entry.name} in ${meta.name}: ${error}`);
					}
				}
			}

			// Calculate combined checksum from all completed catalog results
			// Sort by name to ensure consistent ordering
			const sortedChecksums = completedChecksums
				.map(c => `${c.name}:${c.resultChecksum}`)
				.sort();

			const combinedChecksum = sortedChecksums.length > 0
				? hash(sortedChecksums.join('|'))
				: '';

			// Update meta.json
			const updatedMeta: MetaFile = {
				...meta,
				catalog: meta.catalog, // Updated with individual checksums
				resultChecksum: combinedChecksum,
				completedCount,
				totalCount
			};

			if (!dryRun) {
				await writeJSONFile(metaFile, updatedMeta);
			}
			console.log(`  ${dryRun ? '[DRY-RUN] Would update' : 'Updated'} ${meta.name}: ${completedCount}/${totalCount} completed, checksum: ${combinedChecksum.slice(0, 16)}...`);
			updated++;

		} catch (error) {
			console.error(`  Error processing ${metaFile}: ${error}`);
			errors++;
		}
	}

	console.log('\nBackfill complete:');
	console.log(`  Updated: ${updated}`);
	console.log(`  Skipped: ${skipped}`);
	console.log(`  Errors:  ${errors}`);
}

backfillMetaChecksums().catch(console.error);
