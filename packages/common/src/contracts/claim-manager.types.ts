export interface ClaimOptions {
	groupName?: string;
	consumerId?: string;
	minIdleMs?: number;
	count?: number;
}

export interface IClaimManager<TEntry = unknown> {
	claimEntriesForRetry(options: ClaimOptions): Promise<TEntry[]>;
	releaseStaleClaims(thresholdMs?: number): Promise<number>;
}
