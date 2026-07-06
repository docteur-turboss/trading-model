import { computeExponentialBackoff } from "./backoff-config";
import type { RetryOptions } from "./retry";

/**
 * Appends content to a file with exponential backoff retry.
 * Used for WAL/DLQ fallback when Redis and memory buffers are exhausted.
 *
 * @param filePath — Absolute path to the fallback file
 * @param content — String to append (newline appended automatically)
 * @param options — Retry options (maxRetries, baseDelayMs, maxDelayMs)
 * @returns true if the write succeeded, false if all attempts failed
 */
export async function retryFileAppend(
	filePath: string,
	content: string,
	options?: Partial<RetryOptions>
): Promise<boolean> {
	const maxRetries = options?.maxRetries ?? 3;
	const baseDelayMs = options?.baseDelayMs ?? 100;
	const maxDelayMs = options?.maxDelayMs ?? 800;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const fs = await import("node:fs/promises");
			await fs.appendFile(filePath, `${content}\n`, "utf-8");
			return true;
		} catch {
			if (attempt < maxRetries - 1) {
				await new Promise((resolve) =>
					setTimeout(
						resolve,
						computeExponentialBackoff(attempt, { baseDelayMs, maxDelayMs })
					)
				);
			}
		}
	}
	return false;
}
