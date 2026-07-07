export type WorkerStatus = "active" | "draining" | "offline";

export enum WorkerStatusCode {
	Active = "active",
	Draining = "draining",
	Offline = "offline",
}

export enum DataSource {
	Binance = "binance",
}
