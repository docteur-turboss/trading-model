export interface Serializer {
  serialize(data: unknown): Buffer;
  deserialize<T = unknown>(buffer: Buffer): T;
}