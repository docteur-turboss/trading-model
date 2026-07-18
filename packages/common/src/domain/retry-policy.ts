import type { PositiveInt } from "../domain/primitives";

export interface RetryPolicy {
	retryCount: PositiveInt;
	maxRetries: PositiveInt;
}

export namespace RetryPolicy {
	export function hasExceededMaxRetries(policy: RetryPolicy): boolean {
		return policy.retryCount >= policy.maxRetries;
	}
}
