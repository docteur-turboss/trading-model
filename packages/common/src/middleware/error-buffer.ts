import type {
	CorrelationId,
	InstanceId,
	ISODateTime,
	ServiceId,
	URLString,
	Version,
} from "../domain/primitives";
import type { HttpStatusCode } from "../http-status";
import { CircularBuffer } from "../utils/circular-buffer";
import { normalizeError } from "../utils/errors";

interface ErrorReport {
	message: string;
	stack?: string;
	url: URLString;
	method: string;
	statusCode: HttpStatusCode;
	correlationId: CorrelationId;
	timestamp: ISODateTime;
	serviceName: ServiceId;
	serviceVersion: Version;
	instanceId: InstanceId;
}

export class ErrorBuffer {
	private readonly _buffer: CircularBuffer<ErrorReport>;

	constructor(
		private readonly _endpoint: string,
		private readonly _batchSize: number,
		private readonly _serviceName: ServiceId,
		private readonly _instanceId: InstanceId
	) {
		this._buffer = new CircularBuffer<ErrorReport>(_batchSize * 2);
	}

	add(report: ErrorReport): void {
		this._buffer.add(report);
		if (this._buffer.size >= this._batchSize) {
			void this.flush();
		}
	}

	async flush(): Promise<void> {
		if (this._buffer.size === 0) {
			return;
		}
		const batch = this._buffer.drain();
		await this._post(batch);
	}

	get pendingCount(): number {
		return this._buffer.size;
	}

	private async _post(batch: ErrorReport[]): Promise<void> {
		try {
			await this._sendBatch(batch);
		} catch (err) {
			this._logFlushError(err);
		}
	}

	private _sendBatch(batch: ErrorReport[]): Promise<Response> {
		return fetch(this._endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				errors: batch,
				service: this._serviceName,
				instanceId: this._instanceId,
			}),
		});
	}

	private _logFlushError(err: unknown): void {
		console.error(
			"[ErrorTracking] Failed to flush error reports:",
			normalizeError(err).message
		);
	}
}
