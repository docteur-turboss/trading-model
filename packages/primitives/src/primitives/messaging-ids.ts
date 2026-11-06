import type { BrandedNumber, BrandedString } from "./branded-utils";
import { createNumberBrand, createStringBrand } from "./branded-utils";

export type Topic = BrandedString<"Topic">;
export const Topic = createStringBrand("Topic");
export function toTopic(value: string): Topic {
	return Topic.of(value);
}
export type CorrelationId = BrandedString<"CorrelationId">;
export const CorrelationId = createStringBrand("CorrelationId");
export function toCorrelationId(value: string): CorrelationId {
	return CorrelationId.of(value);
}
export type MessageId = BrandedString<"MessageId">;
export const MessageId = createStringBrand("MessageId");
export function toMessageId(value: string): MessageId {
	return MessageId.of(value);
}
export type MessagePriority = BrandedNumber<"MessagePriority">;
export const MessagePriority = createNumberBrand("MessagePriority", (value) => {
	if (!Number.isInteger(value)) {
		throw new RangeError(`MessagePriority must be an integer, got ${value}`);
	}
});
