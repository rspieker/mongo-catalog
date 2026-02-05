import type { Dirent } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export function ensure(path: string): Promise<string> {
    return mkdir(path, { recursive: true }).then(() => path);
}

export function exists(path: string): Promise<boolean> {
    return stat(path).then(() => true).catch(() => false);
}

export async function files(path: string, recursive: boolean = false): Promise<Array<Dirent>> {
    const entries = await readdir(path, { withFileTypes: true });
    const result: Array<Dirent> = [];

    for (const entry of entries) {
        if (entry.isDirectory() && recursive) {
            const append = await files(resolve(path, entry.name), recursive);
            result.push(...append);
        }
        else if (entry.isFile()) {
            result.push(entry);
        }
    }

    return result;
}