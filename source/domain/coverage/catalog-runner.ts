import { join } from 'node:path'
import { glob } from 'glob'
import type { Catalog } from '../../../catalog/catalog'

export type CatalogEntry = {
    path: string
    name: string
    catalog: Catalog<Record<string, unknown>>
}

export async function loadCatalogs(catalogRoot: string): Promise<CatalogEntry[]> {
    const files = await glob(join(catalogRoot, '**', '*.ts'))
    const entries: CatalogEntry[] = []

    for (const file of files) {
        if (file.endsWith('catalog.ts')) continue

        let mod: Record<string, unknown>
        try {
            mod = await import(file)
        } catch {
            continue
        }

        for (const [exportName, exportValue] of Object.entries(mod)) {
            if (exportName === '__esModule') continue
            if (!isCatalog(exportValue)) continue
            entries.push({
                path: file,
                name: exportName === 'default'
                    ? file.replace(/.*\//, '').replace('.ts', '')
                    : exportName,
                catalog: exportValue,
            })
        }
    }

    return entries
}

function isCatalog(v: unknown): v is Catalog<Record<string, unknown>> {
    return (
        typeof v === 'object' &&
        v !== null &&
        'operations' in v &&
        'collection' in v &&
        Array.isArray((v as Catalog<Record<string, unknown>>).operations) &&
        Array.isArray(
            (v as Catalog<Record<string, unknown>>).collection.records
        )
    )
}
