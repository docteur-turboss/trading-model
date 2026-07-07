export interface IWsConnection {
	connect(): void | Promise<void>;
	disconnect(closeCode?: number, reason?: string): void;
	send(data: unknown): boolean;
	readonly isConnected: boolean;
	onCloseHandler?: () => void;
	onOpen?: () => void;
	onMessage?: (data: unknown) => void;
	onError?: (err: Error) => void;
}
