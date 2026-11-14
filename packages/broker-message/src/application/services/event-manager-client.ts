import { EventEmitter as NodeEventEmitter } from "node:events";
import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/contracts/event-map";

/** Callback signature for event listeners. */
export type Listener<TData> = (data: TData) => void;

/**
 * Typed event bus for broker message events.
 *
 * Wraps rather than extends Node's EventEmitter: `on` returns an unsubscribe
 * function (used to tear down listeners on shutdown), not `this`.
 */
class EventEmitter<TEvents extends keyof EventMap> {
	private readonly _emitter = new NodeEventEmitter();

	on<TEvent extends TEvents>(
		eventName: TEvent,
		callback: Listener<EventMessagesArgs<TEvent>>
	): () => void {
		this._emitter.on(eventName, callback);
		return () => this._emitter.off(eventName, callback);
	}

	emit<TEvent extends TEvents>(
		eventName: TEvent,
		...args: [EventMessagesArgs<TEvent>] extends [undefined]
			? []
			: [EventMessagesArgs<TEvent>]
	): boolean {
		return this._emitter.emit(eventName, args[0]);
	}
}

/** Global event manager for broker message events. */
export const EVENT_MANAGER = new EventEmitter();
