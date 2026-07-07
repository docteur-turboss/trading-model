import { normalizeError } from "../utils/errors";

interface ErrorReport {
	message: string;
	stack?: string;
	url: string;
	method: string;
	statusCode: number;
	correlationId: string;
	timestamp: string;
	serviceName: string;
	serviceVersion: string;
	instanceId: string;
}

export class ErrorBuffer {
	private _buffer: ErrorReport[] = [];

	constructor(
		private readonly _endpoint: string,
		private readonly _batchSize: number,
		private readonly _serviceName: string,
		private readonly _instanceId: string
	) {}

	add(report: ErrorReport): void {
		this._buffer.push(report);
		if (this._buffer.length >= this._batchSize) {
			void this.flush();
		}
	}

	async flush(): Promise<void> {
		if (this._buffer.length === 0) {
			return;
		}
		const batch = this._buffer.splice(0, this._batchSize);
		await this._post(batch);
	}

	get pendingCount(): number {
		return this._buffer.length;
	}

	private async _post(batch: ErrorReport[]): Promise<void> {
		try {
			await fetch(this._endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					errors: batch,
					service: this._serviceName,
					instanceId: this._instanceId,
				}),
			});
		} catch (err) {
			console.error(
				"[ErrorTracking] Failed to flush error reports:",
				normalizeError(err).message
			);
		}
	}
}
