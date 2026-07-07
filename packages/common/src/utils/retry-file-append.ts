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
	const retryCfg = _retryConfig(options);
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (await _tryAppend(filePath, content)) {
			return true;
		}
		if (attempt < maxRetries - 1) {
			await _backoffDelay(attempt, retryCfg);
		}
	}
	return false;
}

function _retryConfig(options?: Partial<RetryOptions>): {
	baseDelayMs: number;
	maxDelayMs: number;
} {
	return {
		baseDelayMs: options?.baseDelayMs ?? 100,
		maxDelayMs: options?.maxDelayMs ?? 800,
	};
}

async function _tryAppend(filePath: string, content: string): Promise<boolean> {
	try {
		const fs = await import("node:fs/promises");
		await fs.appendFile(filePath, `${content}\n`, "utf-8");
		return true;
	} catch {
		return false;
	}
}

async function _backoffDelay(
	attempt: number,
	cfg: { baseDelayMs: number; maxDelayMs: number }
): Promise<void> {
	await new Promise((resolve) =>
		setTimeout(
			resolve,
			computeExponentialBackoff(attempt, {
				baseDelayMs: cfg.baseDelayMs,
				maxDelayMs: cfg.maxDelayMs,
			})
		)
	);
}
