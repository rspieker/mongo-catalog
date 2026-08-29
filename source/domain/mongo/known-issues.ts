import { Version } from '../version';

// A growing registry of confirmed real-MongoDB-server bugs that this
// project deliberately avoids triggering, rather than letting them crash
// collection or produce misleading results.
export type KnownIssue = {
    reference: string;
    message: string;
    version: (version: Version) => boolean;
    operation: (operation: unknown) => boolean;
};

const KNOWN_ISSUES: Array<KnownIssue> = [
    {
        reference: 'CVE-2018-20802',
        message:
            "MongoDB's query planner crashes the whole server " +
            '(Invariant failure indexedOr, src/mongo/db/query/index_tag.cpp) ' +
            'on a query combining a top-level $or with a sibling $expr. ' +
            'Confirmed via direct local reproduction (mongod aborts, SIGABRT) ' +
            'on 3.7.9 and 4.1.3; fixed upstream in 3.6.9/4.0.3/4.1.4. The ' +
            "3.7.x pre-4.0 branch isn't named in the official advisory " +
            '(dev/RC branches predate the released-version tracking CVEs ' +
            'use) but shares the same pre-fix code and crashes identically. ' +
            "$expr didn't exist before 3.6.0, so the lower bound is bounded " +
            'there rather than left open-ended.',
        version: (version) =>
            (version >= Version.from('3.6.0') && version < Version.from('3.6.9')) ||
            (version >= Version.from('3.7.0') && version < Version.from('4.0.0')) ||
            (version >= Version.from('4.0.0') && version < Version.from('4.0.3')) ||
            (version >= Version.from('4.1.0') && version < Version.from('4.1.4')),
        operation: (oper) =>
        !!oper &&
        typeof oper === 'object' &&
        '$or' in (oper as object) &&
        '$expr' in (oper as object),
    },
];

export function findKnownIssue(
    version: Version,
    operation: unknown
): KnownIssue | undefined {
    return KNOWN_ISSUES.find(
        (issue) => issue.version(version) && issue.operation(operation)
    );
}
