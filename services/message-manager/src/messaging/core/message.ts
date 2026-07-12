/**
 * @file message.ts
 *
 * @description
 * Re-exports canonical message contract definitions from
 * `@trading-model/common/contracts/message.types`.
 *
 * This file exists for backward compatibility and all message types
 * are now defined in the shared common package. Prefer importing
 * directly from `@trading-model/common/contracts/message.types` in new code.
 *
 * @architecture
 * Messaging / contract layer.
 */

export type {
	Message,
	MessageMetadata,
} from "@trading-model/validation/contracts/message.types";
