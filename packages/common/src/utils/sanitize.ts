const PEM_LINE_PATTERN = /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g;

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(PEM_LINE_PATTERN, '[REDACTED PEM]');
  }

  if (typeof value === 'object' && value !== null) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        ...(value.stack ? { stack: sanitizeForLog(value.stack) } : {}),
      };
    }
    if (Array.isArray(value)) {
      return value.map(v => sanitizeForLog(v));
    }
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = sanitizeForLog(v);
    }
    return obj;
  }

  return value;
}
