/**
 * Appends content to a file with exponential backoff retry.
 * Used for WAL/DLQ fallback when Redis and memory buffers are exhausted.
 *
 * @param filePath — Absolute path to the fallback file
 * @param content — String to append (newline appended automatically)
 * @param maxAttempts — Maximum retry attempts (default: 3)
 * @returns true if the write succeeded, false if all attempts failed
 */
export async function retryFileAppend(
  filePath: string,
  content: string,
  maxAttempts = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { promises: fs } = await import('node:fs/promises');
      await fs.appendFile(filePath, content + '\n', 'utf-8');
      return true;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
  }
  return false;
}
