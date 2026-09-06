import { hash } from '@konfirm/checksum';

type Operation =
    | string
    | number
    | boolean
    | null
    | RegExp
    | Date
    | Array<Operation>
    | { [key: string]: Operation };
type Replacement =
    `@${string}(:${string | number})?/${string}${'' | `/${string}`}`;

// The key group used to be \w+, which can't match MongoDB operator keys
// ($eq, $gt, ...) or dotted field paths (a.b) — meaning any tagged value
// sitting directly under one of those never matched on the way back out of
// deserialize() and was silently left as the raw tagged string.
const pattern = /^@([a-zA-Z]+)(?::([^\/]+))?\/([^\/]+)(?:\/([^\/]+))?/;
function isReplacer(input: any): input is Replacement {
    return typeof input === 'string' && pattern.test(input);
}

function normalize(input: Operation): Operation {
  // the main reason we need a normalize before handing the Operation to
  // JSON.stringify is that Date instances will have their .toJSON invoked
  // before it's hand over to the replacer function JSON.stringify offer to
  // take into consideration
  if (input === undefined) {
    return '@Undefined/und';
  }
  if (input instanceof Date) {
    return `@Date/${input.toISOString()}`;
  }
  if (input instanceof RegExp) {
    const { source, flags } = input;
    return `@RegExp/${source}/${flags}`;
  }
  if (typeof input === 'number' && !Number.isFinite(input)) {
      // NaN/Infinity/-Infinity all serialize to `null` via plain
      // JSON.stringify, indistinguishable from each other and from a
      // literal null — tag them the same way Date/RegExp are tagged.
      return `@Number/${String(input)}`;
  }
  if (Array.isArray(input)) {
      return input.map(normalize);
  }
  if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, normalize(v)]));
  }

  return input;
}

// A reviver returning `undefined` tells JSON.parse to *delete* the key,
// not assign it `undefined` — there's no way to represent "restore this
// key with value undefined" through a reviver's return value at all. So
// $Undefined revives to this private sentinel instead, and a post-parse
// pass (see deserialize()) swaps it back in via direct assignment
// (`obj[key] = undefined`), which — unlike a reviver's return — does keep
// the key.
const UNDEFINED_SENTINEL = Symbol('undefined');

function reviver(key: string | number, input: Operation): Operation {
    if (isReplacer(input)) {
        const [, type, prop, value, options] = pattern.exec(
            input
        ) as RegExpExecArray;

        if (!prop || prop === key) {
            if (type === 'Date') {
                return new Date(value);
            }
            if (type === 'RegExp') {
                return new RegExp(value, options);
            }
            if (type === 'Number') {
                return Number(value); // 'NaN' -> NaN, 'Infinity' -> Infinity, '-Infinity' -> -Infinity
            }
            if (type === 'Undefined') {
                return UNDEFINED_SENTINEL as unknown as Operation;
            }
        }
    }

    return input;
}

function restoreUndefined(value: any): any {
    if (Array.isArray(value)) {
        value.forEach((v, i) => {
            if (v === UNDEFINED_SENTINEL) value[i] = undefined;
            else restoreUndefined(v);
        });
    } else if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) {
            if (value[k] === UNDEFINED_SENTINEL) value[k] = undefined;
            else restoreUndefined(value[k]);
        }
    }

    return value;
}

export function serialize(operation: any, space?: string | number): string {
    return JSON.stringify(normalize(operation), null, space);
}

export function deserialize(serialized: string): any {
    return restoreUndefined(JSON.parse(serialized, reviver));
}

export function checksum(operation: any): string {
    return hash(serialize(operation));
}

export function id(operation: any, length: number = 12): string {
    const alphabet =
        'abcdefghijlkmnopqrstuvwxyzABCDEFGHIJLKMNOPQRSTUVWXYZ0123456789';
    const short = Array.from(checksum(operation))
        .reduce((carry, char, index) => {
            const pos = index % (length - 1);
            carry[pos] = (carry[pos] || 0) + (char.codePointAt(0) as number);
            return carry;
        }, [] as Array<number>)
        .map((value, index) => alphabet[value % (index ? alphabet.length : 23)])
        .join('');
    const check = Array.from(short, (c) => alphabet.indexOf(c)).reduce(
        (carry, value) => carry + value
    );
    const digit = alphabet[check % alphabet.length];

    return short + digit;
}
