/**
 * Re-exports broker type definitions from `@trading-model/common/domain/tls-paths`.
 * Prefer importing from there directly in new code.
 */

export type { TlsPaths as BrokerConfig } from "@trading-model/common/domain/tls-paths";
export type { ServiceIdentity } from "@trading-model/validation/contracts/message.types";
