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

// Docker Hub's Hub API (registry.hub.docker.com/v2) rate-limits anonymous
// requests per-IP, which on shared GitHub Actions runners gets exhausted by
// unrelated jobs. Authenticating (DOCKERHUB_USERNAME/DOCKERHUB_TOKEN) moves
// the quota to the account instead, and raises the ceiling considerably.
// The JWT is fetched once and reused for the whole paginated walk.
let jwtPromise: Promise<string | null> | null = null;

async function login(): Promise<string | null> {
    const username = process.env.DOCKERHUB_USERNAME;
    const password = process.env.DOCKERHUB_TOKEN;
    if (!username || !password) return null;

    try {
        const response = await fetch('https://hub.docker.com/v2/users/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!response.ok) return null;
        const { token } = await response.json() as { token?: string };
        return token ?? null;
    } catch {
        return null;
    }
}

async function authHeaders(): Promise<Record<string, string>> {
    jwtPromise ??= login();
    const token = await jwtPromise;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getTagsRecursive<T extends DockerTag>(url: string): Promise<Array<T>> {
    const headers = await authHeaders();
    const { next, results: data } = await fetchJSON<DockerTagPage>(url, headers);

    if (next) {
        const append = await getTagsRecursive(next);

        data.push(...append);
    }

    return data as Array<T>
}

export async function getTags<T extends DockerTag>(target: string): Promise<Array<T>> {
    return getTagsRecursive<T>(`https://registry.hub.docker.com/v2/repositories/library/${target}/tags?page_size=100`);
}