import { mkdir } from "fs/promises";

export function ensure(path: string): Promise<string> {
    return mkdir(path, { recursive: true }).then(() => path);
}