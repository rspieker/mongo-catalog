import { codepoints } from "./character";

export function sum(...numbers: Array<number>): number {
  return numbers.reduce((c, n) => c + n);
}

export function avg(...numbers: Array<number>): number {
  return sum(...numbers) / numbers.length;
}

export function min(...numbers: Array<number>): number {
  return Math.min(...numbers);
}

export function max(...numbers: Array<number>): number {
  return Math.max(...numbers);
}

export function confine(value: number, min: number, max: number): number {
  if (min > -Infinity && max < Infinity) {
    return min + (value % (max - min));
  }

  return value;
}

export function integer(
  seed: string,
  min: number = 0,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  // Use xorshift for better distribution than simple sum
  // Convert seed to 32-bit hash using djb2
  let hash = codepoints(seed).reduce(
    (carry, value) => ((carry << 5) + carry + value) >>> 0,
    5381,
  );

  // Apply xorshift for better bit mixing
  hash ^= hash << 13;
  hash ^= hash >>> 17;
  hash ^= hash << 5;
  hash = hash >>> 0;

  // Map to [0, 1) then scale to [min, max]
  const normalized = hash / 4294967296; // 2^32

  return Math.floor(normalized * (max - min + 1)) + min;
}
