import { sum, avg, min, max, confine, integer } from "./providers/numeric";
import { codepoints, shortID, uuid } from "./providers/character";
import { hash, sha256 } from "./providers/hash";
import { pick, list } from "./providers/list";
import {
  adjectives,
  adjectives_indices,
  countries,
  noun,
} from "./resources/data";

// Generator type that captures the actual return type
// TArgs: tuple of argument types after the seed
// TReturn: the return type of the generator
type Generator<TArgs extends unknown[] = unknown[], TReturn = unknown> = {
  (seed: string, ...args: TArgs): TReturn;
};

export function picker<T>(...options: Array<T>): (seed: string) => T {
  return (seed: string) => pick(seed, options);
}

export function number(
  min: number,
  max: number,
  decimals: number = 0,
): (seed: string) => number {
  const factor = Math.pow(10, decimals);

  return factor
    ? (seed: string) => integer(seed, min * factor, max * factor) / factor
    : (seed: string) => integer(seed, min, max);
}

export function several<T>(...options: Array<T>): (seed: string) => Array<T> {
  const limit = Math.min(
    Math.max(0, Math.round(options.length / 4)),
    options.length - 2,
  );

  return (seed: string) => list(seed, options, limit);
}

export function date(from: string, to: string): (seed: string) => Date {
  return (seed: string) => dateInRange(seed, from, to);
}

// Type for the structure - values are either Generators or nested Generations
type Struct = Record<
  string,
  Generator<any, any> | Record<string, Generator<any, any>>
>;

// Recursive type to compile a struct into the resulting document type
// For each key:
// - If it's a Generator, extract its return type
// - If it's a nested object (Generation), recursively compile it
// Root structs get _id added, nested ones don't
type CompiledDocument<
  S extends Struct,
  IsRoot extends boolean = true,
> = (IsRoot extends true ? { _id: number } : {}) & {
  [K in keyof S]: S[K] extends Generator<any, infer R>
    ? R
    : S[K] extends Record<string, Generator<any, any>>
      ? CompiledDocument<S[K], false>
      : never;
};

// Helper to check if a value is a generator function at runtime
function isGenerator(value: unknown): value is Generator {
  return typeof value === "function" && value.length >= 1;
}

// Internal recursive compile function
// When isRoot is true, _id is added to the result
function compileInternal<S extends Struct, IsRoot extends boolean = true>(
  struct: S,
  isRoot: IsRoot,
): (seed: string, index: number) => CompiledDocument<S, IsRoot> {
  return (seed: string, index: number): CompiledDocument<S, IsRoot> => {
    const result: Record<string, unknown> = isRoot ? { _id: index } : {};

    for (const [key, value] of Object.entries(struct)) {
      if (isGenerator(value)) {
        // It's a direct generator - call it with the seed
        result[key] = value(`${seed}:${key}`);
      } else if (typeof value === "object" && value !== null) {
        // It's a nested Generation - recursively compile it
        // Recursive call returns a function that generates the nested document
        const nestedGenerator = compileInternal(value as Struct, false);
        result[key] = nestedGenerator(`${seed}:${key}`, index);
      }
    }

    return result as CompiledDocument<S, IsRoot>;
  };
}

// Public compile function - entry point that adds _id to root level
export function compile<S extends Struct>(
  struct: S,
): (index: number, seed?: string) => CompiledDocument<S, true> {
  const compiled = compileInternal(struct, true);
  return (index: number, seed?: string) =>
    compiled(`${seed || "seeded"}:${index}`, index + 1);
}

// Re-export all generators from compiler.ts for convenience
export function name(seed: string, limit: number = 4): string {
  const subject = pick(seed, noun);
  const indices = list(subject + seed, adjectives_indices, limit);
  const prefix: Array<string> = [];

  for (const index of indices) {
    prefix.push(pick(subject + seed, adjectives[index]));
  }

  return prefix.filter(Boolean).concat(subject).join(" ");
}

export function dateInRange(
  seed: string,
  min: string = "",
  max: string = "",
): Date {
  const [ay = 1980, am = 1, ad = 1] = min
    .split("-")
    .map((v) => Number(v))
    .map((v) => (isNaN(v) ? undefined : v));
  const [by = 2020, bm = 12, bd = 31] = max
    .split("-")
    .map((v) => Number(v))
    .map((v) => (isNaN(v) ? undefined : v));
  const date = [
    integer(seed, ay, by),
    integer(seed, am, bm),
    integer(seed, ad, bd),
  ]
    .map((v) => (v < 10 ? `0${v}` : v))
    .join("-");

  return new Date(date);
}

type Position = [number, number, number?];

export type Country = {
  name: string;
  codes: Array<
    | {
        type: "tld" | "iso3" | "iso2" | "fips" | "tel";
        code: string;
      }
    | {
        type: "isoN";
        code: number;
      }
  >;
  geospatial: Array<
    | {
        type: "point";
        category: string;
        name: string;
        coordinates: Position;
      }
    | {
        type: "box";
        category: string;
        name: string;
        coordinates: [Position, Position];
      }
  >;
};

export function country(seed: string): Country {
  return pick(`${seed}:country`, countries);
}

export function geospatial(
  seed: string,
  from?: Country,
): Country["geospatial"][0]["coordinates"] {
  const { geospatial } = from || country(seed);
  const picked = pick(`${seed}:geospatial`, geospatial);

  return picked.coordinates;
}

// Export provider functions for convenience
export {
  sum,
  avg,
  min,
  max,
  confine,
  integer,
  codepoints,
  shortID,
  uuid,
  hash,
  sha256,
  pick,
  list,
};
