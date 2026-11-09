/**
 * Exclusive right to collect market data (ADR-0057): at most one holder at a
 * time across the collector pods.
 */
export interface LeaderLeasePort {
	/**
	 * Takes the lease when it is free or expired, renews it when held.
	 * True: this instance holds it now. False: another instance holds it, or
	 * changed it concurrently. Throws when the lease store is unreachable.
	 */
	tryAcquireOrRenew(): Promise<boolean>;
	/** Frees the lease if this instance holds it, so a successor takes it at once. */
	release(): Promise<void>;
}
