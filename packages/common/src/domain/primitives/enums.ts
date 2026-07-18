export enum WorkerStatusCode {
	Active = "active",
	Draining = "draining",
	Offline = "offline",
}

export type WorkerStatus = `${WorkerStatusCode}`;

export enum DataSource {
	Binance = "binance",
}
