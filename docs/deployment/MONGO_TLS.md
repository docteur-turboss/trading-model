# MongoDB client TLS (issue #769)

Expand step of ADR-0060: both replica sets (`mongo-dlq`, `mongo-audit`) run `--tlsMode preferTLS`, so TLS and clear text are accepted for one release. Server certificates come from **cert-manager** (`deploy/k8s/infra/mongo-tls.yaml`, prerequisite as in [MYSQL_TLS.md](./MYSQL_TLS.md)); audit-logger and dlq-service use `tls=true&tlsCAFile=/etc/mongo-tls/ca.crt` and verify the host name. Clients still authenticate with their password (ADR-0067); x.509 client certificates are not part of this step.

| Object | Role |
|---|---|
| Issuer `mongo-selfsigned`, Certificate `mongo-ca` (5 years, renewed 90 days before), Issuer `mongo-ca` | internal CA |
| Certificates `mongo-dlq-tls`, `mongo-audit-tls` (90 days, renewed 30 days before, new key each time) | server certificates; SANs: Service, one name per member (`mongo-dlq-0.mongo-dlq-headless`…), `localhost`, `127.0.0.1` |

The init container of each pod writes `server.pem` (certificate + key) and `ca.crt` to the in-memory `/keyfile` volume. Clients mount `ca.crt` only (Secret `mongo-ca`, item `ca.crt`): the CA key never leaves the Secret.

## Rotation

mongod reads its certificate at start. After cert-manager renews `mongo-*-tls` (30 days before the end), restart one set at a time: `kubectl rollout restart statefulset/mongo-dlq` then `statefulset/mongo-audit` (rolling, a majority stays up). Services read the CA when they start: after a CA renewal (~4 years) restart the servers first, then `deployment/dlq-service deployment/audit-logger`.

## Contract step (next release)

Not done here: replace `preferTLS` with `requireTLS`, then move the exporter sidecars, the `mongo-*-users` Jobs, the backup / oplog archive scripts and the restore to TLS (`--tls --tlsCAFile`), add the refusal test (plain connection refused) and correct the MongoDB lines of `docs/compliance/*`. Until then MongoDB clients that connect without TLS are still accepted.
