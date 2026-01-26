import { Serializer } from "./serializer.interface";

export class Serialization implements Serializer {
    serialize(data: unknown): Buffer {
        const json = JSON.stringify(data, (_, value) => {
            if (value instanceof Date) {
                return { __type: 'Date', value: value.toISOString() };
            }
            if (Buffer.isBuffer(value)) {
                return { __type: 'Buffer', value: value.toString('base64') };
            }
            return value;
        });

        return Buffer.from(json, 'utf-8')
    }

    deserialize<T = unknown>(buffer: Buffer): T {
        const json = buffer.toString("utf-8");
            return JSON.parse(json, (_, value) => {
            if (value?.__type === 'Date') {
                return new Date(value.value);
            }
            if (value?.__type === 'Buffer') {
                return Buffer.from(value.value, 'base64');
            }
            return value;
        }) as T;
    }
}