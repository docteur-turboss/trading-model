# Service Registry & Discovery Manager

## Overview

This module implements a service registry and address discovery manager designed for microservice-based architectures. Its primary responsibility is to maintain an authoritative, in-memory view of all active service instances within a secured environment.

Services register themselves, renew their presence through heartbeats, and rotate authentication tokens over time. Consumers can query the registry to discover available services and their instances. The module is intentionally focused on registry and discovery concerns and does not embed business logic from consuming services.

The implementation is written in TypeScript, built on top of Express, and secured using mutual TLS authentication with a shared Root Certificate Authority.

## Architecture Context

The registry acts as a control-plane component inside a microservice ecosystem. It exposes a dedicated API for service instances to announce themselves and maintain liveness, and another API surface for discovery and inspection.

All communications are protected using mTLS. Both clients and the registry server must present certificates signed by the same trusted Root CA. This ensures strong, certificate-based authentication at the transport layer, independent of any application-level credentials.

Service liveness is managed using a TTL-based leasing model. Each registered instance must periodically send heartbeats to remain active. Expired instances are automatically evicted by an internal lease manager.

## Key Responsibilities

The module manages service instance registration and updates, including automatic instance identifier generation when needed. It maintains instance liveness through heartbeats and TTL enforcement. It provides service discovery endpoints to list services, enumerate instances, and retrieve instance metadata. It enforces instance-level authentication using short-lived tokens bound to registered instances. It integrates with a lease management process to evict expired or unreachable instances.

This module is designed to be replaced or extended with a distributed backend such as Redis or etcd without changing its public API.

## Security Model

Transport security is enforced via mutual TLS. The server requires client certificates and validates them against a trusted Root CA. Unauthorized clients are rejected at the TLS layer before any HTTP request is processed.

At the application layer, each service instance is issued a unique token at registration time. This token must be presented for sensitive operations such as heartbeats and token rotation. Tokens are instance-scoped and can be rotated without re-registering the service.

Server-side control and administrative validation logic is planned and will be introduced in a future iteration.

## Installation

The module requires Node.js with native TLS support and a TypeScript-compatible runtime. Dependencies are managed via a standard package manager.

After installing dependencies, the project can be built using the TypeScript compiler. Runtime execution requires valid TLS material, including a server certificate, private key, and Root CA certificate.

## Configuration

The service is configured primarily through environment variables. TLS certificates and keys are loaded from the filesystem, with paths configurable via environment variables. The listening port can be overridden at runtime. Cleanup intervals for expired services can also be adjusted using environment configuration.

All configuration defaults are suitable for local development but should be explicitly set in production environments.

## Runtime Behavior

On startup, the server initializes an HTTPS Express application with strict TLS settings. Client certificates are required and unauthorized connections are rejected. The registry is initialized in memory, and the lease manager starts a periodic cleanup job.

Service instances interact with the registry by registering themselves, sending periodic heartbeats, and rotating tokens when required. Discovery clients query the registry to obtain service topology information.

## API Design

The API is REST-based and exposed over HTTPS only. Endpoints are grouped under a registry namespace and separated by responsibility. Controllers handle validation, authorization, and error handling, while routing remains thin and declarative.

Responses follow a consistent structure and error handling strategy to simplify client integration.

## Logging and Observability

The module integrates structured logging for lifecycle events, security-related actions, and lease cleanup operations. Logs are designed to be compatible with centralized logging systems commonly used in production environments.

Metrics and advanced observability hooks can be added externally without modifying core logic.

## Limitations and Scope

The registry is currently in-memory and intended for controlled environments or as a foundational building block. High availability, persistence, and multi-node synchronization are not yet included. Server-side control validation and advanced policy enforcement are planned for upcoming versions.