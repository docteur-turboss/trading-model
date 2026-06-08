import { EventMessagesArgs, EventMap } from '@trading-model/common/config/event.types';

/** Callback signature for event listeners. */
export type Listener<T> = (data: T) => void;

class EventEmitter<TEvents extends keyof EventMap> {
  private listeners: {
    [K in TEvents]?: Set<Listener<EventMessagesArgs<K>>>;
  } = {};

  on<K extends TEvents>(eventName: K, callback: Listener<EventMessagesArgs<K>>) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = new Set();
    }

    this.listeners[eventName]!.add(callback);

    return () => this.off(eventName, callback);
  }

  removeAllListeners() {
    this.listeners = {};
  }

  off<K extends TEvents>(eventName: K, callback: Listener<EventMessagesArgs<K>>) {
    this.listeners[eventName]?.delete(callback);
  }

  emit<K extends TEvents>(
    eventName: K,
    ...args: [EventMessagesArgs<K>] extends [void] ? [] : [EventMessagesArgs<K>]
  ) {
    const listeners = this.listeners[eventName];
    if (!listeners) return;

    for (const cb of listeners) {
      cb(args[0] as EventMessagesArgs<K>);
    }
  }
}

/** Global event manager for broker message events. */
export const EventManager = new EventEmitter();
