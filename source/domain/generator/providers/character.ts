import { sha256 } from "./hash";

const LC = "abcdefghijklmnopqrstuvwxyz";
const UC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGIT = "0123456789";
const alphanum = `${LC}${UC}${DIGIT}`;

export function codepoints(seed: string): Array<number> {
  return Array.from(seed, (char) => char.codePointAt(0)).filter(
    (n): n is number => n !== undefined,
  );
}

export function shortID(
  seed: string,
  length: number = 7,
  alphabet: string = alphanum,
): string {
  return codepoints(sha256(seed))
    .reduce((carry, cp, i) => {
      const pos = i % length;

      carry[pos] = (carry[pos] || 0) + cp;

      return carry;
    }, [] as Array<number>)
    .map((v) => alphabet[v % alphabet.length])
    .join("");
}

export function uuid(seed: string): string {
  //'00000000-0000-0000-0000-000000000000'
  const hash = sha256(seed);
  return [
    hash.slice(0, 8),
    hash.slice(9, 13),
    hash.slice(14, 18),
    hash.slice(19, 23),
    hash.slice(24, 32),
  ].join("-");
}
