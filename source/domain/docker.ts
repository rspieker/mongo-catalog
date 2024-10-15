import { fetchJSON } from "./json";

export type DockerImage = {
    architecture: string;
    digest: string;
    os: string;
    status: string;
    [key: string]: unknown;
};
export type DockerTag = {
    name: string;
    v2: boolean;
    digest: string;
    images: Array<DockerImage>;
    last_updated: string;
    [key: string]: unknown;
}
type DockerTagPage = {
    count: number;
    next?: string | null;
    previous?: string | null;
    results: Array<DockerTag>;
};

async function getTagsRecursive<T extends DockerTag>(url: string): Promise<Array<T>> {
    const { next, results: data } = await fetchJSON<DockerTagPage>(url);

    if (next) {
        const append = await getTagsRecursive(next);

        data.push(...append);
    }

    return data as Array<T>
}

export async function getTags<T extends DockerTag>(target: string): Promise<Array<T>> {
    return getTagsRecursive<T>(`https://registry.hub.docker.com/v2/repositories/library/${target}/tags?page_size=100`);
}