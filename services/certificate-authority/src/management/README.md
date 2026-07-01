# Certificate Management Module

This module handles certificate lifecycle management beyond issuance. It is separated from the signing layer to enable future decomposition into an independent `certificate-manager` service.

## Responsibilities

- Certificate revocation and CRL management
- Certificate rotation scheduling
- CA key rotation
- Distributed locking for cross-instance coordination
- Audit store for certificate operations
- Redis pub/sub for cross-instance revocation events

## Boundaries

- Does NOT handle certificate signing
- Does NOT handle CSR validation
- Depends on signing module for certificate issuance during rotation
- Communicates lifecycle events via message bus
