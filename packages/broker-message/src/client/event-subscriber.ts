import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";
import type { Listener } from "./event-manager-client";
import { EVENT_MANAGER } from "./event-manager-client";

export class EventSubscriber {
	/** Cleanup functions to be called on stop. */
	cleanupFns: (() => void)[] = [];

	on<TEvent extends keyof EventMap>(
		eventName: TEvent,
		listener: Listener<EventMessagesArgs<TEvent>>
	) {
		this.cleanupFns.push(EVENT_MANAGER.on(eventName, listener));
	}

	removeAllListeners() {
		this.cleanupFns.forEach((fn) => {
			fn();
		});
		this.cleanupFns = [];
	}
}
