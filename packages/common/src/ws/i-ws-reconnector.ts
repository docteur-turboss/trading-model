export interface IWsReconnector {
	scheduleReconnect(connectFn?: () => void): void;
	cancel(): void;
	stop(): void;
	reset(): void;
	readonly shouldReconnect: boolean;
	readonly attempt: number;
}
