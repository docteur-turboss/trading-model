import { EventMessagesArgs, EventMap } from "config/event.types";

export type Listener<T> = [T] extends [void]
  ? () => void
  : (data: T) => void;

class EventEmitter<TEvents extends keyof EventMap> {
    private listeners: {
        [K in TEvents]?: Set<Listener<EventMessagesArgs<K>>>
    } = {};

    on<K extends TEvents>(
        eventName: K,
        callback: Listener<EventMessagesArgs<K>>
    ) {
        if (!this.listeners[eventName]) {
        this.listeners[eventName] = new Set();
        }

        this.listeners[eventName]!.add(callback);

        return () => this.off(eventName, callback);
    }

    off<K extends TEvents>(
        eventName: K,
        callback: Listener<EventMessagesArgs<K>>
    ) {
        this.listeners[eventName]?.delete(callback);
    }

    emit<K extends TEvents>(
        eventName: K,
        ...args: [EventMessagesArgs<K>] extends [void] ? [] : [EventMessagesArgs<K>]
    ) {
        const listeners = this.listeners[eventName];
        if (!listeners) return;

        listeners.forEach(cb => {
            if (args.length === 0) {
            (cb as () => void)();
            } else {
            (cb as (data: EventMessagesArgs<K>) => void)(args[0]);
            }
        });
    }
}

export const EventManager = new EventEmitter();