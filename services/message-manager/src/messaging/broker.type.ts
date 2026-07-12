/**
 * @file broker.type.ts
 *
 * @description
 * Re-exports broker-related type definitions from the canonical
 * `@trading-model/common/domain/tls-paths` module.
 *
 * This file exists for backward compatibility and prefer importing
 * directly from `@trading-model/common/domain/tls-paths` in new code.
 *
 * @architecture
 * Messaging / contract layer.
 */

export type { TlsPaths as BrokerConfig } from "@trading-model/common/domain/tls-paths";
export type { ServiceIdentity } from "@trading-model/validation/contracts/message.types";
