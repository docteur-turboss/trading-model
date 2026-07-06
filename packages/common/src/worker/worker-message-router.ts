import { EventEmitter } from "node:events";

import type {
	SchedulerOutgoingMessage,
	SchedulerWsJobAssignedMessage,
} from "../contracts/worker-protocol.types";

export class WorkerMessageRouter {
	private readonly _handlers: Partial<
		Record<
			SchedulerOutgoingMessage["type"],
			(message: Record<string, unknown>) => void
		>
	>;

	constructor(emitter: EventEmitter) {
		this._handlers = {
			"job.assigned": (msg) =>
				emitter.emit(
					"job.assigned",
					(msg as unknown as SchedulerWsJobAssignedMessage).job,
				),
			"heartbeat.ack": () => emitter.emit("heartbeat.ack"),
			drain: () => emitter.emit("drain"),
		};
	}

	handle(message: Record<string, unknown>, onUnknown: (msg: Record<string, unknown>) => void): void {
		const handler =
			this._handlers[message.type as SchedulerOutgoingMessage["type"]];
		if (handler) {
			handler(message);
		} else {
			onUnknown(message);
		}
	}
}
