export interface IWsConnection {
	connect(): void;
	disconnect(closeCode?: number, reason?: string): void;
	send(data: unknown): boolean;
	readonly isConnected: boolean;
	onCloseHandler?: () => void;
}
