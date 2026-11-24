import { EventEmitter as NodeEventEmitter } from "node:events";
import type {
	EventMap,
	EventMessagesArgs,
} from "@trading-model/contracts/event-map";

/** Metadata of a delivered message: only the topic is guaranteed, other fields are passed as sent. */
export interface DeliveredMetadata {
	topic: string;
	messageId?: string;
	correlationId?: string;
}

/** Callback signature for event listeners: a rejection leaves the message to redelivery. */
export type Listener<TData> = (
	data: TData,
	metadata: DeliveredMetadata,
	/** Aborts at the delivery deadline: stop the work, the message is redelivered. */
	signal?: AbortSignal
) => void | Promise<void>;

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

	listenerCount(eventName: TEvents): number {
		return this._emitter.listenerCount(eventName);
	}

	/** Runs the listeners one after the other; rejects with the first failure. */
	async emit<TEvent extends TEvents>(
		eventName: TEvent,
		data: EventMessagesArgs<TEvent>,
		metadata: DeliveredMetadata,
		signal?: AbortSignal
	): Promise<void> {
		for (const listener of this._emitter.listeners(eventName)) {
			await (listener as Listener<EventMessagesArgs<TEvent>>)(
				data,
				metadata,
				signal
			);
		}
	}
}

/** Global event manager for broker message events. */
export const EVENT_MANAGER = new EventEmitter();
