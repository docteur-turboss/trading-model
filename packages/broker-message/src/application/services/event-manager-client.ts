import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/common/config/event.types";
import { TypedEventEmitter } from "@trading-model/common/worker/typed-event-emitter";

/** Callback signature for event listeners. */
export type Listener<TData> = (data: TData) => void;

/**
 * Typed event bus for broker message events.
 *
 * Composes `TypedEventEmitter` rather than extending it: `on` returns an
 * unsubscribe function (used to tear down listeners on shutdown), while the
 * base class returns `this` for chaining, which is incompatible.
 */
class EventEmitter<TEvents extends keyof EventMap> {
	private readonly _emitter = new TypedEventEmitter<{
		[TEvent in TEvents]: [EventMessagesArgs<TEvent>];
	}>();

	on<TEvent extends TEvents>(
		eventName: TEvent,
		callback: Listener<EventMessagesArgs<TEvent>>
	): () => void {
		this._emitter.on(eventName, callback);

		return () => this._emitter.off(eventName, callback);
	}

	off<TEvent extends TEvents>(
		eventName: TEvent,
		callback: Listener<EventMessagesArgs<TEvent>>
	): void {
		this._emitter.off(eventName, callback);
	}

	removeAllListeners(): void {
		this._emitter.raw.removeAllListeners();
	}

	emit<TEvent extends TEvents>(
		eventName: TEvent,
		...args: [EventMessagesArgs<TEvent>] extends [undefined]
			? []
			: [EventMessagesArgs<TEvent>]
	): boolean {
		return this._emitter.emit(eventName, args[0] as EventMessagesArgs<TEvent>);
	}
}

/** Global event manager for broker message events. */
export const EVENT_MANAGER = new EventEmitter();
