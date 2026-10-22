import { EventEmitter } from "node:events";

/**
 * A typed wrapper around Node.js EventEmitter.
 *
 * Provides type-safe `on`, `off`, `emit`, and `removeAllListeners` methods
 * with event name and argument constraints.
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown[]>> {
	readonly raw = new EventEmitter();

	on<TEventName extends keyof TEvents & string>(
		eventName: TEventName,
		listener: (...args: TEvents[TEventName]) => void
	): this {
		this.raw.on(eventName, listener as (...args: unknown[]) => void);
		return this;
	}

	off<TEventName extends keyof TEvents & string>(
		eventName: TEventName,
		listener: (...args: TEvents[TEventName]) => void
	): this {
		this.raw.off(eventName, listener as (...args: unknown[]) => void);
		return this;
	}

	emit<TEventName extends keyof TEvents & string>(
		eventName: TEventName,
		...args: TEvents[TEventName]
	): boolean {
		return this.raw.emit(eventName, ...args);
	}

	removeAllListeners<TEventName extends keyof TEvents & string>(
		eventName?: TEventName
	): this {
		this.raw.removeAllListeners(eventName as string | undefined);
		return this;
	}
}
