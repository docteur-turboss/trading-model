import type { SchedulerOutgoingMessage } from "@trading-model/contracts/worker-protocol-types";

/** Outbound channel to connected workers (implemented by the WebSocket WorkerProtocol). */
export interface WorkerProtocolPort {
	sendToWorker(workerId: string, message: SchedulerOutgoingMessage): void;
	sendDrain(workerId: string): void;
	broadcastDrain(): void;
	close(): void;
}
