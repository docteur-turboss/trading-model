import type { MaxRetries, RetryCount } from "./primitives";

export interface RetryPolicy {
	retryCount: RetryCount;
	maxRetries: MaxRetries;
}

export function hasExceededMaxRetries(policy: RetryPolicy): boolean {
	return policy.retryCount >= policy.maxRetries;
}
