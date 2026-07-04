import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";

/** Callback signature for event listeners. */
export type Listener<TData> = (data: TData) => void;

class EventEmitter<TEvents extends keyof EventMap> {
	private _listeners: {
		[TEvent in TEvents]?: Set<Listener<EventMessagesArgs<TEvent>>>;
	} = {};

	on<TEvent extends TEvents>(
		eventName: TEvent,
		callback: Listener<EventMessagesArgs<TEvent>>
	) {
		if (!this._listeners[eventName]) {
			this._listeners[eventName] = new Set();
		}

		this._listeners[eventName]!.add(callback);

		return () => this.off(eventName, callback);
	}

	removeAllListeners() {
		this._listeners = {};
	}

	off<TEvent extends TEvents>(
		eventName: TEvent,
		callback: Listener<EventMessagesArgs<TEvent>>
	) {
		this._listeners[eventName]?.delete(callback);
	}

	emit<TEvent extends TEvents>(
		eventName: TEvent,
		...args: [EventMessagesArgs<TEvent>] extends [undefined]
			? []
			: [EventMessagesArgs<TEvent>]
	) {
		const listeners = this._listeners[eventName];
		if (!listeners) {
			return;
		}

		for (const cb of listeners) {
			cb(args[0] as EventMessagesArgs<TEvent>);
		}
	}
}

/** Global event manager for broker message events. */
export const EVENT_MANAGER = new EventEmitter();
