import type { DefaultWsReconnector } from "../ws/default-ws-reconnector";
import type { TypedEventEmitter } from "./typed-event-emitter";
import type { WorkerClientEvents } from "./worker-client";
import type { WorkerHeartbeat } from "./worker-heartbeat";
import type { WorkerMessageRouter } from "./worker-message-router";
import type { WorkerWsConnection } from "./worker-ws-connection";

export interface WireConnectionHandlers {
	heartbeat: WorkerHeartbeat;
	reconnector: DefaultWsReconnector;
	messageRouter: WorkerMessageRouter;
	emitter: TypedEventEmitter<WorkerClientEvents>;
}

export function wireConnectionEvents(
	connection: WorkerWsConnection,
	handlers: WireConnectionHandlers
): void {
	connection.onOpen = () => {
		handlers.heartbeat.start();
		handlers.emitter.emit("connected");
	};
	connection.onCloseHandler = () => {
		handlers.heartbeat.stop();
		handlers.emitter.emit("disconnected");
		if (!handlers.reconnector.intentionalClose) {
			handlers.reconnector.scheduleReconnect();
		}
	};
	connection.onMessage = (data) => {
		try {
			handlers.messageRouter.handle(JSON.parse(String(data)), (msg) =>
				handlers.emitter.emit("unknown", msg)
			);
		} catch (err) {
			handlers.emitter.emit(
				"error",
				new Error(`Invalid message from server: ${err}`)
			);
		}
	};
	connection.onError = (err) => {
		handlers.emitter.emit("error", err);
	};
}
