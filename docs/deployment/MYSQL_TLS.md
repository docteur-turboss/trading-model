# MySQL client TLS (issue #767)

Server certificate issued by **cert-manager** from an internal CA; every client verifies the host name. Prerequisite: cert-manager and its CRDs in the cluster (`check-prereqs.sh` fails the deploy otherwise; kind CI installs it in `tests/k8s/run-kind.sh cluster`).

## What exists

| Object | Role |
|---|---|
| Issuer `mysql-selfsigned`, Certificate `mysql-ca` (5 years, renewed 90 days before), Issuer `mysql-ca` | internal CA |
| Certificate `mysql-tls` (90 days, renewed 30 days before, new key each time) → Secret `mysql-tls` | server certificate; SANs `mysql`, `mysql-primary`, `mysql-headless`, `*.mysql-headless`, `localhost`, `127.0.0.1` |
| ConfigMap `mysql-client-tls` | `my.cnf` of the CLI clients (`MYSQL_HOME=/etc/mysql-client`: `ssl-mode=VERIFY_IDENTITY`), `exporter.cnf` |

Clients, and the exporter sidecar through a `items: ca.crt` volume, mount only `ca.crt` of `mysql-tls`: financial-scraper and its collector (`DB_SSL_CA`), migration Jobs (`DB_SSL_CA`), `db-migrate-user`, `mysql-cluster-init`, `db-retention`, SPIRE server (`root_ca_path`), mysqld-exporter. Compose is unchanged (plain). Backups, restores and PITR go through `kubectl exec` and the local socket.

## Rotation

1. cert-manager renews `mysql-tls`; the kubelet refreshes the mounted Secret within about a minute.
2. The `tls-reload` sidecar of each pod hashes `tls.crt` every 60 s and runs `ALTER INSTANCE RELOAD TLS` when it changed (no restart; log `server certificate reloaded`, or `reload failed, retrying`). Check the served expiry: `kubectl exec mysql-0 -c mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW STATUS LIKE \"Ssl_server_not_after\""'`.
3. CA renewal (every ~4 years) is **not** zero-downtime: clients read `ca.crt` when they start, and the leaf is reissued by the new CA, so a client still holding the old CA fails the verification on every new connection until it restarts (open connections of a pool survive). Expected gap: about 1 to 3 minutes (kubelet refresh ≤ 1 min + sidecar tick ≤ 1 min + rollout), so plan it in a quiet window. Order: `kubectl cert-manager renew mysql-ca`, wait for the leaf (`kubectl get certificate mysql-tls` Ready), then at once `kubectl rollout restart deployment/financial-scraper deployment/financial-scraper-collector statefulset/mysql` and the SPIRE server. CronJobs started in the gap fail and run again at the next schedule. A two-CA bundle (trust-manager) would remove the gap; not adopted: one more cluster component for an event every four years. Not rehearsed in CI.

## Contract step (next release)

The expand release accepts plain connections so that N-1 pods keep working during the rolling update. Once N is deployed everywhere: add `require_secure_transport=ON` to `group-replication.cnf` (`mysql.yaml`), then correct the MySQL line of `docs/compliance/*`. `tests/k8s/run-kind.sh verify_mysql_tls` already expects a plain connection to be refused exactly when the variable is ON.

## Not covered

MySQL does not authenticate clients by certificate (SVID or other): passwords stay. Redis, Sentinel and MongoDB are other issues (#768, #769).
