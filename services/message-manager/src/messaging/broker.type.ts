/**
 * @file broker.type.ts
 *
 * @description
 * Re-exports broker-related type definitions from the canonical
 * `@trading-model/common/domain/tls-paths` module.
 *
 * This file exists for backward compatibility — prefer importing
 * directly from `@trading-model/common/domain/tls-paths` in new code.
 *
 * @architecture
 * Messaging / contract layer.
 */

export type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
export type { TlsPaths as BrokerConfig } from "@trading-model/common/domain/tls-paths";
