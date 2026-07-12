# ADR-0009: Reorganize certificate-utils with Domain Sub-directories

**Status:** Accepted
**Date:** 2026-06

## Context

`@trading-model/certificate-utils/src/` contains 22 TypeScript files in a single flat directory with no organizational structure. Files covering key generation, CSR creation, certificate validation, signing providers, vault integration, and worker pool management are all together.

## Decision

Reorganize into 4 domain sub-directories:

```
packages/certificate-utils/src/
├── index.ts                  # Barrel re-exports all sub-modules
├── keygen/                   # Key generation & storage
│   ├── generate-key-pair.ts
│   ├── key-vault.ts
│   ├── secure-key-store.ts
│   └── types.ts              # Key-related types
├── signing/                  # Signing providers & operations
│   ├── sign-certificate.ts
│   ├── create-csr.ts
│   ├── signing-provider.ts
│   ├── remote-signing-client.ts
│   ├── vault-signing-provider.ts
│   └── vault-transit-client.ts
├── validation/               # Certificate validation & info
│   ├── validate-certificate.ts
│   ├── certificate-info.ts
│   ├── crl.ts
│   └── crl-validator.ts
├── workers/                  # Async worker infrastructure
│   ├── crypto-worker.ts
│   ├── worker-pool.ts
│   ├── worker-script.ts
│   ├── lazy-pool.ts
│   └── async.ts
└── format/                   # PEM formatting & serialization
    ├── format.ts
    ├── cache.ts
    └── sign.ts
```

### Migration Steps

1. Create sub-directories
2. Move files into their domains
3. Update internal import paths (`.ts` → `./domain/file.ts`)
4. Update `index.ts` barrel exports to new paths
5. Update all 5 consumers: `certificate-client`, `certificate-authority`, `discovery-server`, `financial-scraper`, `trader-trainer`
6. Verify build and tests pass

### Compatibility

The existing sub-path exports in `package.json` will be updated to point to the new paths. No consumer changes are needed if using deep imports like `@trading-model/certificate-utils/sign-certificate`.
