# Error codes

Every `ErrorCode` value exported by `@trading-model/common/utils/errors` (`packages/common/src/utils/errors/base.ts`). The `code` field of an `AppError` holds the value in the first column. A test (`packages/common/tests/unit/error-codes-catalog.spec.ts`) fails when a code has no row here.

The HTTP status is the `httpStatus` set by the factory in `errors/*.ts`. `500` is the default when a code has no factory or the factory passes none.

| Code | HTTP | Cause | Expected action (caller) |
| ---- | ---- | ----- | ------------------------ |
| `ServiceNotFoundError` | 404 | Discovery has no instance registered under the requested service name. | Check the service name and that the service is running and registered; retry after it registers. |
| `ServiceUnreachableError` | 410 | Service is known to discovery but no instance answered (circuit open, DNS or TLS failure). | Retry with backoff; check the target's health and `docker compose logs <service>`. |
| `AuthenticationError` | 498 | Signed request or token rejected (bad signature, expired timestamp, unknown caller). | Do not retry as is; fix the credentials, SVID or clock, then resend. |
| `AddressManagerError` | 503 | Address manager failed to register, heartbeat or resolve an address. | Retry; check discovery-server and Redis availability. |
| `MessageManagerError` | 503 | Message-manager call failed (publish, subscribe, unavailable). | Retry with backoff; check message-manager health. |
| `MetadataBuilderError` | 500 | Reserved for message metadata construction failures; no factory throws it today. | Treat as a bug; report with the log context. |
| `TimeoutError` | 503 | An operation exceeded its time limit. | Retry with backoff; raise the timeout only if the target is known slow. |
| `NackError` | 500 | A consumer rejected a message (negative acknowledgement). | The broker redelivers, then dead-letters; inspect the reason in the DLQ. |
| `DeadLetterError` | 503 | Sending a message to the dead-letter queue failed. | Retry; check dlq-service and MongoDB. |
| `AgentError` | 503 | A trading agent (training or inference) failed. | Check trainer logs; retry the run. |
| `BackpressureError` | 503 | A queue or buffer is full and refuses new work. | Slow down and retry later; check the consumer's lag. |
| `ConfigurationError` | 500 | Missing or invalid configuration (env var, file). | Fix the configuration (see `docs/deployment/ENV.md`) and restart; retrying does not help. |
| `DlqCapacityError` | 500 | The DLQ reached its capacity limit. | Replay or purge entries in dlq-service, then resume. |
| `AppErrorError` | 500 | Default code of `createAppError` when the caller gave none. | Treat as unclassified; read the message and `cause`; give it a specific code if recurring. |
| `HttpClientError` | 500 | Outbound HTTP call returned an error status or failed (`statusCode` carries the remote status). | Act on the remote `statusCode`; 5xx may be retried, 4xx must be fixed. |
| `HttpClientTimeoutError` | 500 | Outbound HTTP call exceeded its timeout. | Retry with backoff; check the remote service's latency. |
