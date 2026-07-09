export enum WorkerStatusCode {
	Active = "active",
	Draining = "draining",
	Offline = "offline",
}

export type WorkerStatus = `${WorkerStatusCode}`;

const WORKER_STATUS_DISPLAY: Record<WorkerStatusCode, string> = {
	[WorkerStatusCode.Active]: "Online",
	[WorkerStatusCode.Draining]: "Draining",
	[WorkerStatusCode.Offline]: "Offline",
};

export function formatWorkerDisplayName(status: WorkerStatusCode): string {
	return WORKER_STATUS_DISPLAY[status];
}

export function parseWorkerDisplayName(
	display: string
): WorkerStatusCode | undefined {
	for (const [code, name] of Object.entries(WORKER_STATUS_DISPLAY)) {
		if (name === display) {
			return code as WorkerStatusCode;
		}
	}
}

export enum DataSource {
	Binance = "binance",
}
