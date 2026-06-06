/**
 * Deterministic JSON serialization for cryptographic signing.
 *
 * `JSON.stringify` does not guarantee property ordering across engines,
 * which makes it unsuitable for producing reproducible message digests.
 * This function recursively serializes an object with sorted keys so
 * that the same logical value always produces the same string, regardless
 * of the insertion order used to construct the object.
 *
 * - Primitives and arrays are serialised as usual.
 * - Object keys are sorted lexicographically (recursively).
 * - Prototype properties are ignored (only own enumerable keys).
 * - Cyclic references throw the standard TypeError.
 *
 * @param value - The value to serialize.
 * @returns A JSON string with deterministically ordered keys.
 */
export function deterministicStringify(value: unknown): string {
  return JSON.stringify(value, deterministicReplacer);
}

const deterministicReplacer = (_key: string, value: unknown): unknown => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of keys) {
      sorted[key] = (value as Record<string, unknown>)[key];
    }
    return sorted;
  }

  return value;
};
