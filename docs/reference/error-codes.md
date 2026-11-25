# Error codes

Every `ErrorCode` value exported by `@trading-model/common/utils/errors` (`packages/common/src/utils/errors/base.ts`). The `code` field of an `AppError` holds the value in the first column. A test (`packages/common/tests/unit/error-codes-catalog.spec.ts`) fails when a code has no row here.

The HTTP status is the `httpStatus` set by the factory in `errors/*.ts`. `500` is the default when a code has no factory or the factory passes none.

| Code | HTTP | Cause | Expected action (caller) |
| ---- | ---- | ----- | ------------------------ |
| `AuthenticationError` | 498 | Signed request or token rejected (bad signature, expired timestamp, unknown caller). | Do not retry as is; fix the credentials, SVID or clock, then resend. |
| `AddressManagerError` | 503 | Address manager failed to resolve an address. | Retry; check DNS and the target service. |
| `MessageManagerError` | 503 | Bus call failed (journal publish or read, Redis unavailable). | Retry with backoff; check Redis health. |
| `DeadLetterError` | 503 | A message must be dead-lettered at once: payload rejected by the subscriber (`Invalid payload format`). The bus copies it to a dead stream. | Do not retry the message; read it with `audit-dlq list`, fix the cause, then `replay` (runbook-message-bus-outage). |
| `AgentError` | 503 | A trading agent (training or inference) failed. | Check trainer logs; retry the run. |
| `ConfigurationError` | 500 | Missing or invalid configuration (env var, file). | Fix the configuration (see `docs/deployment/ENV.md`) and restart; retrying does not help. |
| `DlqCapacityError` | 500 | The DLQ reached its capacity limit. | Replay or delete entries with the audit-logger `dlq-cli`, then resume. |
| `AppErrorError` | 500 | Default code of `createAppError` when the caller gave none. | Treat as unclassified; read the message and `cause`; give it a specific code if recurring. |
| `HttpClientError` | 500 | Outbound HTTP call returned an error status or failed (`statusCode` carries the remote status). | Act on the remote `statusCode`; 5xx may be retried, 4xx must be fixed. |
| `HttpClientTimeoutError` | 500 | Outbound HTTP call exceeded its timeout. | Retry with backoff; check the remote service's latency. |
