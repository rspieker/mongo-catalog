import { readFile, writeFile } from 'node:fs/promises'
import { checksum } from '../serialization'
import type { QueryFingerprint } from './fingerprint'
import type { BehavioralSignature } from './behavioral-signature'

export type TodoEntry = {
    fingerprint: QueryFingerprint
    source: string
    signature: BehavioralSignature
}

export async function injectTodo(
    catalogFilePath: string,
    entry: TodoEntry
): Promise<void> {
    const content = await readFile(catalogFilePath, 'utf-8')
    const tag = checksum(entry.fingerprint).slice(0, 8)

    if (content.includes(`TODO [fingerprint: ${tag}]`)) return

    const comment = buildComment(tag, entry)
    await writeFile(catalogFilePath, content.trimEnd() + '\n\n' + comment + '\n', 'utf-8')
}

function buildComment(tag: string, entry: TodoEntry): string {
    const { cardinality, fieldShape, errorCode } = entry.signature
    const behavior = [cardinality, fieldShape, errorCode]
        .filter(Boolean)
        .join(' | ')

    return [
        `// TODO [fingerprint: ${tag}]: ${JSON.stringify(entry.fingerprint)}`,
        `// source: ${entry.source}`,
        `// behavior: ${behavior}`,
    ].join('\n')
}
