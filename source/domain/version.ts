import { Maybe } from "./generic";

type BuildVersionString<T extends string> = T | `${T}${'.' | '-'}${string}`;
type MajorVersionString = `${number}`;
type MinorVersionString = `${number}.${number}`;
type PatchVersionString = `${number}.${number}.${number}`;
export type VersionString = BuildVersionString<MajorVersionString | MinorVersionString | PatchVersionString>;

const cache: Map<string, Version> = new Map();

export class Version {
    static readonly #pattern = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[.-](.+))?/;
    readonly #version: string;
    readonly #parts: [number, Maybe<number>, Maybe<number>, Maybe<string>];

    constructor(version: string, noval?: 0 | '0') {
        if (!Version.#pattern.test(version)) {
            throw new Error(`Invalid Version; "${version}"`);
        }

        const und = noval || (typeof noval === 'number') ? Number(noval) : undefined;
        this.#version = version;
        const [, major, minor, patch, build] = version.match(Version.#pattern) as RegExpMatchArray;
        this.#parts = [
            Number(major),
            minor?.length ? Number(minor) : und,
            patch?.length ? Number(patch) : und,
            build?.length ? build : undefined
        ];
    }

    get major(): number {
        return this.#parts[0];
    }

    get minor(): Maybe<number> {
        return this.#parts[1];
    }

    get patch(): Maybe<number> {
        return this.#parts[2];
    }

    get build(): Maybe<string> {
        return this.#parts[3];
    }

    get version(): string {
        return this.#version;
    }

    [Symbol.toPrimitive](hint: 'string' | 'number') {
        const relevant = this.#parts.slice(0, 3).filter((num) => typeof num === 'number');

        if (hint === 'string') {
            return relevant.join('.');
        }

        return relevant.reduce((carry, value, index) => carry + value * Math.pow(100, 3 - index), 0);
    }

    toJSON(): string {
        return String(this);
    }

    static isVersionString(version: any): version is VersionString {
        return this.#pattern.test(version);
    }

    static from(version: any): Version {
        if (this.isVersionString(version)) {
            const instance = new Version(version);
            const key = String(instance);

            if (!cache.has(key)) {
                cache.set(key, instance);
            }

            return cache.get(key) as Version;
        }

        throw new Error(`Not a version string: ${JSON.stringify(version)}`);
    }
}
