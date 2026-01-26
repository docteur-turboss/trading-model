export interface Transport {
  send(topic: string, message: unknown): Promise<void>;
  start(): Promise<void>;
}