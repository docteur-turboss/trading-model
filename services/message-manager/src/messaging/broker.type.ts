/**
 * @file broker.type.ts
 *
 * @description
 * Re-exports broker-related type definitions from the canonical
 * `@trading-model/common/contracts/message.types` module.
 *
 * This file exists for backward compatibility — prefer importing
 * directly from `@trading-model/common/contracts/message.types` in new code.
 *
 * @architecture
 * Messaging / contract layer.
 */

export type { IdentifyType, BrokerConfig } from '@trading-model/common/contracts/message.types';
