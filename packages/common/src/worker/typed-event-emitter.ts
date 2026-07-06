import { EventEmitter } from "node:events";

export class TypedEventEmitter<
	Events extends { [K in keyof Events]: unknown[] },
> {
	readonly raw = new EventEmitter();

	on<Event extends keyof Events>(
		event: Event,
		listener: (...args: Events[Event]) => void
	): this {
		this.raw.on(event as string, listener as (...args: unknown[]) => void);
		return this;
	}

	off<Event extends keyof Events>(
		event: Event,
		listener: (...args: Events[Event]) => void
	): this {
		this.raw.off(event as string, listener as (...args: unknown[]) => void);
		return this;
	}

	emit<Event extends keyof Events>(
		event: Event,
		...args: Events[Event]
	): boolean {
		return this.raw.emit(event as string, ...args);
	}
}
