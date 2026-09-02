// Tags a query with the top-level MongoDB operators it exercises (e.g.
// `$near`, not its `$geometry`/`$maxDistance` arguments), each scored by
// centrality vs. how deeply it's nested as a supporting condition.
//
// Operator vs. argument is structural, not a lookup: the first `$`-key at a
// field-value position (or top level) is the operator; its value is never
// visited. Only `$and`/`$or`/`$nor`/`$not` are recursed through (their
// value is a sub-query), and each recursion increments the nesting depth
// the score is based on.
//
// KNOWN_OPERATORS is deliberately NOT load-bearing for classification: a
// previous attempt to build an allowlist from monger's docs was missing
// $box/$center/$centerSphere/$polygon, which would have silently
// misclassified. It exists only so findUnknownOperators can flag novel
// `$`-keys for review.
const LOGICAL_RECURSE = new Set(['$and', '$or', '$nor']);

// `$options` is only valid as a `$regex` sibling, never standalone — but
// malformed fixtures like `{$not: {$options: 'x'}}` surface it alone at a
// field-value position, so it must be excluded explicitly. Other
// argument-only keys ($geometry, $maxDistance, $box, ...) always sit
// *inside* an operator's value, so the "stop after first `$`-key" rule
// already keeps them out.
const NEVER_OPERATOR = new Set(['$options']);

// Score multiplier per level of logical-operator recursion. Root/field-level
// operators score 1; one $and/$or/$not deep scores DEPTH_DECAY, two levels
// DEPTH_DECAY². Judgment call, not derived — tune directly if the curve
// feels wrong.
const DEPTH_DECAY = 0.75;

export type OperatorTag = { operator: string; score: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOperator(operators: Map<string, number>, operator: string, depth: number): void {
    const score = DEPTH_DECAY ** depth;
    const existing = operators.get(operator);
    // The same operator can appear at multiple depths across one query
    // (e.g. $gt used in two different $or branches at different nesting) —
    // keep its shallowest, i.e. highest-scoring, occurrence.
    if (existing === undefined || score > existing) {
        operators.set(operator, score);
    }
}

// Walks a FIELD's value (the `{...}` in `{point: {...}}`) looking for its
// operator. Only the first `$`-key is the operator — later sibling `$`-keys
// are modifiers (`$options`), and anything inside the operator's value is
// argument territory. This hop doesn't increment depth: a field's operator
// is as central as a top-level one.
function findFieldOperator(value: unknown, operators: Map<string, number>, depth: number): void {
    if (!isPlainObject(value)) {
        return;
    }

    for (const [key, nested] of Object.entries(value)) {
        if (!key.startsWith('$') || NEVER_OPERATOR.has(key)) {
            continue;
        }

        recordOperator(operators, key, depth);

        if (key === '$not') {
            // $not wraps another field-level operator expression (or a
            // bare regex), not an argument object — recurse the same way,
            // one level deeper.
            findFieldOperator(nested, operators, depth + 1);
        }

        return;
    }
}

// Walks a top-level query or $and/$or/$nor sub-query. Non-$ keys are field
// names (never operators themselves), so their values go to
// findFieldOperator at the same depth. For $expr/$where/$text/$jsonSchema,
// the value is a different mini-language — don't recurse.
function classifyValue(query: unknown, operators: Map<string, number>, depth: number): void {
    if (!isPlainObject(query)) {
        return;
    }

    for (const [key, value] of Object.entries(query)) {
        if (!key.startsWith('$')) {
            findFieldOperator(value, operators, depth);
            continue;
        }

        recordOperator(operators, key, depth);

        if (LOGICAL_RECURSE.has(key) && Array.isArray(value)) {
            value.forEach((sub) => classifyValue(sub, operators, depth + 1));
        }
        // $expr/$where/$text/$jsonSchema/etc: value is a different
        // mini-language, do not recurse.
    }
}

/**
 * Returns every top-level MongoDB operator a query exercises, each tagged
 * with a 0–1 centrality score, most central first. E.g.
 * `{$or: [a, {$and: [{f:{$lt:1}}, {g:{$gte:2}}]}]}` yields
 * `[$or:1, $and:0.6, $lt:0.36, $gte:0.36]`. Argument keys
 * ($geometry/$maxDistance/etc) never appear.
 */
export function classifyOperators(query: Record<string, unknown>): Array<OperatorTag> {
    const operators = new Map<string, number>();
    classifyValue(query, operators, 0);

    return [...operators.entries()]
        .map(([operator, score]) => ({ operator, score: Math.round(score * 1000) / 1000 }))
        .sort((a, b) => b.score - a.score || a.operator.localeCompare(b.operator));
}

// Best-effort inventory for findUnknownOperators only, not a source
// of truth; expect periodic upkeep.
export const KNOWN_OPERATORS: ReadonlySet<string> = new Set([
    '$abs', '$acos', '$acosh', '$add', '$all', '$allElementsTrue', '$and',
    '$anyElementTrue', '$arrayElemAt', '$arrayToObject', '$asin', '$asinh',
    '$atan', '$atanh', '$binarySize', '$bitAnd', '$bitNot', '$bitOr', '$bitXor',
    '$bitsAllClear', '$bitsAllSet', '$bitsAnyClear', '$bitsAnySet', '$bsonSize',
    '$box', '$ceil', '$center', '$centerSphere', '$cmp', '$concat',
    '$concatArrays', '$cond', '$convert', '$cos', '$cosh', '$dateAdd',
    '$dateDiff', '$dateFromParts', '$dateFromString', '$dateSubtract',
    '$dateToParts', '$dateToString', '$dateTrunc', '$dayOfMonth', '$dayOfWeek',
    '$dayOfYear', '$degreesToRadians', '$divide', '$elemMatch', '$eq',
    '$exists', '$exp', '$expr', '$filter', '$firstN', '$floor', '$function',
    '$geoIntersects', '$geoWithin', '$getField', '$gt', '$gte', '$hour',
    '$ifNull', '$in', '$indexOfArray', '$indexOfBytes', '$indexOfCP',
    '$isArray', '$isNumber', '$isoDayOfWeek', '$isoWeek', '$isoWeekYear',
    '$jsonSchema', '$last', '$lastN', '$let', '$literal', '$ln', '$log',
    '$lt', '$lte', '$ltrim', '$map', '$maxN', '$millisecond', '$minN',
    '$minute', '$mod', '$month', '$multiply', '$ne', '$near', '$nearSphere',
    '$nin', '$nor', '$not', '$objectToArray', '$or', '$polygon', '$pow',
    '$radiansToDegrees', '$rand', '$range', '$reduce', '$regex',
    '$regexFind', '$regexFindAll', '$regexMatch', '$replaceAll',
    '$replaceOne', '$reverseArray', '$round', '$rtrim', '$second',
    '$setDifference', '$setEquals', '$setField', '$setIntersection',
    '$setIsSubset', '$setUnion', '$sin', '$sinh', '$size', '$slice',
    '$sortArray', '$split', '$sqrt', '$strLenBytes', '$strLenCP',
    '$strcasecmp', '$substr', '$substrBytes', '$substrCP', '$subtract',
    '$switch', '$tan', '$tanh', '$text', '$toBool', '$toDate', '$toDecimal',
    '$toDouble', '$toHashedIndexKey', '$toInt', '$toLong', '$toLower',
    '$toObjectId', '$toString', '$toUpper', '$trim', '$trunc', '$type',
    '$unsetField', '$week', '$where', '$year', '$zip',
]);

export function findUnknownOperators(tags: Iterable<OperatorTag>): Array<string> {
    return [...tags].map((t) => t.operator).filter((op) => !KNOWN_OPERATORS.has(op));
}
