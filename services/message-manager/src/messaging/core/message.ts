/**
 * @file message.ts
 *
 * @description
 * Re-exports canonical message contract definitions from
 * `@trading-model/common/contracts/message.types`.
 *
 * This file exists for backward compatibility — all message types
 * are now defined in the shared common package. Prefer importing
 * directly from `@trading-model/common/contracts/message.types` in new code.
 *
 * @architecture
 * Messaging / contract layer.
 */

export { message, MessageMetadata } from '@trading-model/common/contracts/message.types';
