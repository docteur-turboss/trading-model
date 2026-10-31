import type { BrandedNumber, BrandedString } from "./branded-utils";
import { createNumberBrand, createStringBrand } from "./branded-utils";

export type Topic = BrandedString<"Topic">;
export const Topic = createStringBrand("Topic");
export function toTopic(value: string): Topic {
	return Topic.of(value);
}
export function fromTopic(value: Topic): string {
	return value;
}

export type CorrelationId = BrandedString<"CorrelationId">;
export const CorrelationId = createStringBrand("CorrelationId");
export function toCorrelationId(value: string): CorrelationId {
	return CorrelationId.of(value);
}
export function fromCorrelationId(value: CorrelationId): string {
	return value;
}

export type MessageId = BrandedString<"MessageId">;
export const MessageId = createStringBrand("MessageId");
export function toMessageId(value: string): MessageId {
	return MessageId.of(value);
}
export function fromMessageId(value: MessageId): string {
	return value;
}

export type MessagePriority = BrandedNumber<"MessagePriority">;
export const MessagePriority = createNumberBrand("MessagePriority", (value) => {
	if (!Number.isInteger(value)) {
		throw new RangeError(`MessagePriority must be an integer, got ${value}`);
	}
});
export function toMessagePriority(value: number): MessagePriority {
	return MessagePriority.of(value);
}
export function fromMessagePriority(value: MessagePriority): number {
	return value;
}
