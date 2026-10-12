import { EventEmitter } from "node:events";

/**
 * A typed wrapper around Node.js EventEmitter.
 *
 * Provides type-safe `on`, `off`, `emit`, and `removeAllListeners` methods
 * with event name and argument constraints.
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown[]>> {
	readonly raw = new EventEmitter();

	on<K extends keyof TEvents & string>(
		eventName: K,
		listener: (...args: TEvents[K]) => void
	): this {
		this.raw.on(eventName, listener as (...args: unknown[]) => void);
		return this;
	}

	off<K extends keyof TEvents & string>(
		eventName: K,
		listener: (...args: TEvents[K]) => void
	): this {
		this.raw.off(eventName, listener as (...args: unknown[]) => void);
		return this;
	}

	emit<K extends keyof TEvents & string>(
		eventName: K,
		...args: TEvents[K]
	): boolean {
		return this.raw.emit(eventName, ...args);
	}

	removeAllListeners<K extends keyof TEvents & string>(
		eventName?: K
	): this {
		this.raw.removeAllListeners(eventName as string | undefined);
		return this;
	}
}
