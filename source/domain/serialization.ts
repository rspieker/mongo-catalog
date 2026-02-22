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
    `@${string}:${string | number}/${string}${'' | `/${string}`}`;

const pattern = /^@([a-zA-Z]+):(\w+)\/([^\/]+)(?:\/([^\/]+))?/;
function isReplacer(input: any): input is Replacement {
    return typeof input === 'string' && pattern.test(input);
}

function replacer(key: string | number, input: Operation): Operation {
    if (input instanceof Date) {
        return `@Date:${key}/${input.toISOString()}`;
    }
    if (input instanceof RegExp) {
        const { source, flags } = input;
        return `@RegExp:${key}/${source}/${flags}`;
    }

    return input;
}

function reviver(key: string | number, input: Operation): Operation {
    if (isReplacer(input)) {
        const [, type, prop, value, options] = pattern.exec(
            input
        ) as RegExpExecArray;

        if (prop === key) {
            if (type === 'Date') {
                return new Date(value);
            }
            if (type === 'RegExp') {
                return new RegExp(value, options);
            }
        }
    }

    return input;
}

export function serialize(operation: any, space?: string | number): string {
    return JSON.stringify(operation, replacer, space);
}

export function deserialize(serialized: string): any {
    return JSON.parse(serialized, reviver);
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
