import { type BinaryToTextEncoding, type Hash, createHash } from "node:crypto";

export function hash(
  algorithm: string,
  digest: BinaryToTextEncoding,
  ...values: [unknown, ...Array<unknown>]
): string {
  return values
    .reduce(
      (carry: Hash, value) => carry.update(JSON.stringify(value)),
      createHash(algorithm),
    )
    .digest(digest);
}

export const sha256 = (...values: [unknown, ...Array<unknown>]): string =>
  hash("sha256", "hex", ...values);
