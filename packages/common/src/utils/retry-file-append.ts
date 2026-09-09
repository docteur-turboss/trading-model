import { DurationMs } from "../domain/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoff,
} from "./backoff-config";
import type { RetryOptions } from "./retry";
import { sleep } from "./sleep";

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
			await sleep(computeExponentialBackoff(attempt, retryCfg));
		}
	}
	return false;
}

function _retryConfig(options?: Partial<RetryOptions>): BackoffConfig {
	return {
		baseDelayMs: options?.baseDelayMs ?? DurationMs.of(100),
		maxDelayMs: options?.maxDelayMs ?? DurationMs.of(800),
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
