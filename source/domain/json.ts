import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ensure } from "./filesystem";

export type JSONValue = string | number | boolean | null | undefined | Array<JSONValue> | { [key: string]: JSONValue };

export async function readJSONFile<T = JSONValue>(path: string): Promise<T> {
    return readFile(path)
        .then((buffer: Buffer) => buffer.toString('utf8'))
        .then((data: string) => JSON.parse(data) as T);
}

export async function writeJSONFile(path: string, data: JSONValue): Promise<typeof data> {
    return ensure(dirname(path))
        .then(() => writeFile(path, JSON.stringify(data, null, '\t')))
        .then(() => data);
}

export async function fetchJSON<T = JSONValue>(url: string): Promise<T> {
    return fetch(url)
        .then((response) => response.json() as Promise<T>);
}
