import { Version } from '../version';

// A growing registry of confirmed real-MongoDB-server bugs that this
// project deliberately avoids triggering, rather than letting them crash
// collection or produce misleading results.
export type VersionRange = {
    from: string;
    to: string;
};

export type KnownIssue = {
    reference: string;
    message: string;
    versions: VersionRange[];
    operation: (operation: unknown) => boolean;
};

// "<from>..<to>[,<from>..<to>...]" — the same range-compression notation
// chore/unify.ts already uses when summarizing which tracked versions share
// a result. `to` is exclusive (the fix version itself, already safe).
// Throws on a malformed spec rather than silently matching nothing — a typo
// here should fail loudly, not just silently cost coverage with no visible
// error.
function versionRanges(spec: string): VersionRange[] {
    return spec.split(',').map((range) => {
        const [from, to] = range.split('..').map((part) => part.trim());
        if (!from || !to) {
            throw new Error(
                `Invalid version range "${range}" in "${spec}" — expected "<from>..<to>"`
            );
        }
        return { from, to };
    });
}

function inRange(version: Version, { from, to }: VersionRange): boolean {
    return version >= Version.from(from) && version < Version.from(to);
}

// Guards `operation` being a real object before checking key presence, so
// call sites don't need to repeat that boilerplate. Presence-only for now —
// add a sibling (hasKeysWithValue/isStruct) if a future issue also needs to
// assert something about a key's value, rather than growing this one.
function hasKeys(operation: unknown, ...keys: string[]): boolean {
    return (
        !!operation &&
        typeof operation === 'object' &&
        keys.every((key) => key in (operation as object))
    );
}

const KNOWN_ISSUES: Array<KnownIssue> = [
    {
        reference: 'CVE-2018-20802',
        message: `MongoDB's query planner crashes the whole server \
(Invariant failure indexedOr, src/mongo/db/query/index_tag.cpp) on a query \
combining a top-level $or with a sibling $expr. Confirmed via direct local \
reproduction (mongod aborts, SIGABRT) on 3.7.9 and 4.1.3; fixed upstream in \
3.6.9/4.0.3/4.1.4. The 3.7.x pre-4.0 branch isn't named in the official \
advisory (dev/RC branches predate the released-version tracking CVEs use) \
but shares the same pre-fix code and crashes identically. $expr didn't \
exist before 3.6.0, so the lower bound is bounded there rather than left \
open-ended.`,
        versions: versionRanges('3.6..3.6.9,3.7..4.0.3,4.1..4.1.4'),
        operation: (oper) => hasKeys(oper, '$or', '$expr'),
    },
];

export function findKnownIssue(
    version: Version,
    operation: unknown
): KnownIssue | undefined {
    return KNOWN_ISSUES.find(
        (issue) =>
            issue.versions.some((range) => inRange(version, range)) &&
            issue.operation(operation)
    );
}
