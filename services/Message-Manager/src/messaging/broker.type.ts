import { ServiceInstanceName } from "cash-lib/config/services.types"

/**
 * @file broker.type.ts
 * 
 * @description
 * This module defines the **core types and constants** used by the broker system.
 * It includes service identity, broker TLS configuration, and delivery mode enumerations.
 * 
 * @responsability
 * - Provide TypeScript types for broker services
 * - Standardize delivery semantics and service identity representation
 * - Ensure consistent TLS configuration across broker instances
 * 
 * @restrictions
 * - This module does not implement any runtime logic
 * - Only type definitions and constants are provided
 * - Should be imported by broker core and HTTP layers only
 * 
 * @architecture
 * Acts as a **shared type layer** within the broker system.
 * Serves as the contract for configuration and message delivery modes.
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */

/**
 * IdentifyType
 * 
 * @description
 * Represents the identity of a service instance within the broker system.
 * Used to identify publishers and subscribers for routing and load-balancing.
 */
export interface IdentifyType {
  /** Logical name of the emitting service */
  serviceName: keyof typeof ServiceInstanceName;

  /** Unique instance identifier (pod/container) */
  instanceId: string;
}

/**
 * BrokerConfig
 * 
 * @description
 * Configuration object for TLS-secured broker connections.
 * Contains file paths to certificates required for mutual TLS authentication.
 */
export interface BrokerConfig {
  /** Path to the Root CA certificate */
  RootCACertPath: string;

  /** Path to the client certificate */
  CertificatPath: string;

  /** Path to the client key */
  KeyCertificatPath: string;
}