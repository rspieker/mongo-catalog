import { fetchJSON } from "./json";

async function getTagsRecursive<T>(url: string): Promise<Array<T>> {
    const { next, results: data } = await fetchJSON<{ next?: string, results: Array<any> }>(url);

    if (next) {
        const append = await getTagsRecursive(next);

        data.push(...append);
    }

    return data as Array<T>
}

export async function getTags<T>(target: string): Promise<Array<T>> {
    return getTagsRecursive(`https://registry.hub.docker.com/v2/repositories/library/${target}/tags?page_size=100`);
}