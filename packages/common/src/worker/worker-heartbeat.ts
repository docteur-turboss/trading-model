import { toInstanceId } from "../domain/primitives";
import type { WorkerWsHeartbeatMessage } from "../contracts/worker-protocol.types";

export class WorkerHeartbeat {
	private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private _currentLoad = 0;
	private readonly _workerId: string;
	private readonly _send: (msg: WorkerWsHeartbeatMessage) => void;
	private readonly _intervalMs: number;

	constructor(
		workerId: string,
		send: (msg: WorkerWsHeartbeatMessage) => void,
		intervalMs: number,
	) {
		this._workerId = workerId;
		this._send = send;
		this._intervalMs = intervalMs;
	}

	start(): void {
		this._heartbeatTimer = setInterval(() => {
			this._sendHeartbeat();
		}, this._intervalMs);
	}

	stop(): void {
		if (this._heartbeatTimer) {
			clearInterval(this._heartbeatTimer);
			this._heartbeatTimer = null;
		}
	}

	updateLoad(load: number): void {
		this._currentLoad = load;
	}

	sendHeartbeat(currentLoad?: number): void {
		if (currentLoad !== undefined) {
			this._currentLoad = currentLoad;
		}
		this._send({
			type: "heartbeat",
			workerId: toInstanceId(this._workerId),
			currentLoad: this._currentLoad,
		});
	}

	private _sendHeartbeat(): void {
		this.sendHeartbeat();
	}
}
