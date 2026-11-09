/**
 * Exclusive right to train (ADR-0058): at most one holder at a time across the
 * trainer pods.
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
