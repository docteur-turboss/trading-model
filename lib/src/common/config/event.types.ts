export interface EventMap {
  "example.show.create": void;
  "example.debug.create": { debug: boolean };
}

export const EnumEventMessage = {
  exampleEvent: "example.show.create",
  testEvent: "example.debug.create",
} as const satisfies Record<string, keyof EventMap>;

type EventMessage = keyof EventMap;

export type EventMessagesArgs<T extends EventMessage> = EventMap[T];
export type EventEnumMap = typeof EnumEventMessage[keyof typeof EnumEventMessage];