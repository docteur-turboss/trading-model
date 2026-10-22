import type { PositiveInt } from "./primitives";

export interface RetryPolicy {
	retryCount: PositiveInt;
	maxRetries: PositiveInt;
}

export namespace RetryPolicy {
	export function hasExceededMaxRetries(policy: RetryPolicy): boolean {
		return policy.retryCount >= policy.maxRetries;
	}
}
