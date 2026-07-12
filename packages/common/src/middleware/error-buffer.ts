import type { InstanceId, ServiceId, URLString } from "../domain/primitives";
import { CircularBuffer } from "../utils/circular-buffer";
import { normalizeError } from "../utils/errors";
import type { ErrorReportBody } from "./error-report-builder";

export interface ErrorBufferConfig {
	endpoint: URLString;
	batchSize: number;
	serviceName: ServiceId;
	instanceId: InstanceId;
}

export class ErrorBuffer {
	private readonly _buffer: CircularBuffer<ErrorReportBody>;
	private readonly _endpoint: URLString;
	private readonly _batchSize: number;
	private readonly _serviceName: ServiceId;
	private readonly _instanceId: InstanceId;

	constructor(config: ErrorBufferConfig) {
		this._endpoint = config.endpoint;
		this._batchSize = config.batchSize;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._buffer = new CircularBuffer<ErrorReportBody>(config.batchSize * 2);
	}

	add(report: ErrorReportBody): void {
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

	private async _post(batch: ErrorReportBody[]): Promise<void> {
		try {
			await this._sendBatch(batch);
		} catch (err) {
			this._logFlushError(err);
		}
	}

	private _sendBatch(batch: ErrorReportBody[]): Promise<Response> {
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
