export interface IWalLifecycle {
	drainAndStop(timeoutMs?: number): Promise<void>;
	stop(): void;
	drainWalOnStartup(): Promise<void>;
	drainWal(timeoutMs?: number): Promise<void>;
}
