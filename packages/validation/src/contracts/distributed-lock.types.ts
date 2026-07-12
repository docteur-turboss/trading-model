export interface IDistributedLock {
	acquire(lockId?: string): Promise<boolean>;
	release(lockId?: string): Promise<void>;
}
