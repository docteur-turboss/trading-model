import type { EventEmitter } from "node:events";
import type {
	SchedulerOutgoingMessage,
	SchedulerWsJobAssignedMessage,
} from "@trading-model/validation/contracts/worker-protocol.types";
import type { JsonObject } from "../domain/primitives";

export class WorkerMessageRouter {
	private readonly _handlers: Partial<
		Record<SchedulerOutgoingMessage["type"], (message: JsonObject) => void>
	>;

	constructor(emitter: EventEmitter) {
		this._handlers = {
			"job.assigned": (msg) =>
				emitter.emit(
					"job.assigned",
					(msg as unknown as SchedulerWsJobAssignedMessage).job
				),
			"heartbeat.ack": () => emitter.emit("heartbeat.ack"),
			drain: () => emitter.emit("drain"),
		};
	}

	handle(message: JsonObject, onUnknown: (msg: JsonObject) => void): void {
		const handler =
			this._handlers[message.type as SchedulerOutgoingMessage["type"]];
		if (handler) {
			handler(message);
		} else {
			onUnknown(message);
		}
	}
}
