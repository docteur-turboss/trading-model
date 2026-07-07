import type { WorkerWsHeartbeatMessage } from "../contracts/worker-protocol.types";
import { toInstanceId } from "../domain/primitives";
import { TimerHandle } from "../utils/timer-handle";

export class WorkerHeartbeat {
	private readonly _heartbeatTimer = new TimerHandle();
	private readonly _workerId: string;
	private readonly _send: (msg: WorkerWsHeartbeatMessage) => void;
	private readonly _intervalMs: number;

	constructor(
		workerId: string,
		send: (msg: WorkerWsHeartbeatMessage) => void,
		intervalMs: number
	) {
		this._workerId = workerId;
		this._send = send;
		this._intervalMs = intervalMs;
	}

	start(): void {
		this._heartbeatTimer.startInterval(() => {
			this._send({
				type: "heartbeat",
				workerId: toInstanceId(this._workerId),
				currentLoad: 0,
			});
		}, this._intervalMs);
	}

	stop(): void {
		this._heartbeatTimer.stop();
	}

	sendHeartbeat(currentLoad: number): void {
		this._send({
			type: "heartbeat",
			workerId: toInstanceId(this._workerId),
			currentLoad,
		});
	}
}
