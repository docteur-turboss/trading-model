const MONGODB_OPERATORS = new Set([
  '$where',
  '$regex',
  '$options',
  '$function',
  '$accumulator',
  '$ne',
  '$eq',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$exists',
  '$expr',
  '$and',
  '$or',
  '$nor',
  '$not',
]);

const MAX_DEPTH = 10;

export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) {
    throw new Error('Payload exceeds maximum nesting depth');
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizePayload(item, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') && MONGODB_OPERATORS.has(key)) {
        throw new Error(`Blocked operator in payload key: ${key}`);
      }
      sanitized[key] = sanitizePayload(val, depth + 1);
    }
    return sanitized;
  }

  return value;
}
