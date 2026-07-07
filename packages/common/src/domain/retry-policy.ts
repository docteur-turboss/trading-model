export interface RetryPolicy {
	retryCount: number;
	maxRetries: number;
}

export function hasExceededMaxRetries(policy: RetryPolicy): boolean {
	return policy.retryCount >= policy.maxRetries;
}
