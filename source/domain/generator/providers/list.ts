import { codepoints, shortID } from "./character";
import { sha256 } from "./hash";
import { avg, confine, min, sum } from "./numeric";

export function list<T = unknown>(
  seed: string,
  source: Array<T>,
  limit: number = 3,
): Array<T> {
  const points = codepoints(shortID(sha256(seed, ...source)));
  const ranged = points.map((cp) => cp % source.length);
  const unique = [...new Set(ranged)];
  const count = confine(
    Math.round(avg(...points)),
    1,
    min(limit, source.length),
  );

  return unique.slice(0, count).map((cp) => source[cp]);
}

export function pick<T = unknown>(seed: string, source: Array<T>): T {
  const points = codepoints(shortID(sha256(seed, ...source)));
  const index = sum(...points);

  return source[index % source.length];
}
