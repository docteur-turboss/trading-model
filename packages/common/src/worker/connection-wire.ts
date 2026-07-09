import type { DefaultWsReconnector } from "../ws/default-ws-reconnector";
import type { TypedEventEmitter } from "./typed-event-emitter";
import type { WorkerClientEvents } from "./worker-client";
import type { WorkerHeartbeat } from "./worker-heartbeat";
import type { WorkerMessageRouter } from "./worker-message-router";
import type { WorkerWsConnection } from "./worker-ws-connection";

export function wireConnectionEvents(
	connection: WorkerWsConnection,
	heartbeat: WorkerHeartbeat,
	reconnector: DefaultWsReconnector,
	messageRouter: WorkerMessageRouter,
	emitter: TypedEventEmitter<WorkerClientEvents>
): void {
	connection.onOpen = () => {
		heartbeat.start();
		emitter.emit("connected");
	};
	connection.onClose = () => {
		heartbeat.stop();
		emitter.emit("disconnected");
		if (!reconnector.intentionalClose) {
			reconnector.scheduleReconnect();
		}
	};
	connection.onMessage = (data) => {
		try {
			messageRouter.handle(JSON.parse(String(data)), (msg) =>
				emitter.emit("unknown", msg)
			);
		} catch (err) {
			emitter.emit("error", new Error(`Invalid message from server: ${err}`));
		}
	};
	connection.onError = (err) => {
		emitter.emit("error", err);
	};
}
