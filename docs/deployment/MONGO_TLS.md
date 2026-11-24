# MongoDB client TLS (issue #769)

Both replica sets (`mongo-dlq`, `mongo-audit`) run `--tlsMode requireTLS` (contract step of ADR-0060; `preferTLS` was release 3.1.0): clear text is refused. Server certificates come from **cert-manager** (`deploy/k8s/infra/mongo-tls.yaml`, prerequisite as in [MYSQL_TLS.md](./MYSQL_TLS.md)); audit-logger and dlq-service use `tls=true&tlsCAFile=/etc/mongo-tls/ca.crt` and verify the host name. Clients still authenticate with their password (ADR-0067); x.509 client certificates are not part of this step.

| Object | Role |
|---|---|
| Issuer `mongo-selfsigned`, Certificate `mongo-ca` (5 years, renewed 90 days before), Issuer `mongo-ca` | internal CA |
| Certificates `mongo-dlq-tls`, `mongo-audit-tls` (90 days, renewed 30 days before, new key each time) | server certificates; SANs: Service, one name per member (`mongo-dlq-0.mongo-dlq-headless`…), `localhost`, `127.0.0.1` |

The init container of each pod writes `server.pem` (certificate + key) and `ca.crt` to the in-memory `/keyfile` volume. Clients mount `ca.crt` only (Secret `mongo-ca`, item `ca.crt`): the CA key never leaves the Secret.

## Rotation

mongod reads its certificate at start. After cert-manager renews `mongo-*-tls` (30 days before the end), restart one set at a time: `kubectl rollout restart statefulset/mongo-dlq` then `statefulset/mongo-audit` (rolling, a majority stays up). Services read the CA when they start: after a CA renewal (~4 years) restart the servers first, then `deployment/dlq-service deployment/audit-logger`.

## Clients

Exporter sidecars, `mongo-*-users` Jobs, backup / oplog scripts and restore connect with `--tls --tlsCAFile` (`ca.crt`: `/keyfile` in the mongod container, Secret `mongo-ca` elsewhere).
