# MySQL client TLS (issue #767)

Server certificate issued by **cert-manager** from an internal CA; every client verifies the host name. Prerequisite: cert-manager and its CRDs in the cluster (`check-prereqs.sh` fails the deploy otherwise; kind CI installs it in `tests/k8s/run-kind.sh cluster`).

## What exists

| Object | Role |
|---|---|
| Issuer `mysql-selfsigned`, Certificate `mysql-ca` (5 years, renewed 90 days before), Issuer `mysql-ca` | internal CA |
| Certificate `mysql-tls` (90 days, renewed 30 days before, new key each time) → Secret `mysql-tls` | server certificate; SANs `mysql`, `mysql-primary`, `mysql-headless`, `*.mysql-headless`, `localhost`, `127.0.0.1` |
| Certificates `mysql-client-<user>` (90 days, renewed 30 days before) | client certificate of each MySQL user |
| ConfigMap `mysql-client-tls` | `my.cnf` of the CLI clients (`MYSQL_HOME=/etc/mysql-client`: `ssl-mode=VERIFY_IDENTITY`, client certificate), `exporter.cnf` |

Every network client has its **own client certificate** (Certificate `mysql-client-<user>`, CN = MySQL user, same CA; users `root`, `scraper`, `migrator`, `retention`, `exporter`). The Secret holds `ca.crt`, `tls.crt`, `tls.key`; the client mounts it at `/etc/mysql-tls` in place of `mysql-tls` (the server key is never mounted by a client): financial-scraper and its collector (`DB_SSL_CA`, `DB_SSL_CERT`, `DB_SSL_KEY`; user `scraper`), migration Jobs (`migrator`), `db-retention` (`retention`), mysqld-exporter (`exporter`), `db-migrate-user`, `mysql-cluster-init`, the SPIRE server (`root_ca_path`, `client_cert_path`, `client_key_path`; `root`) and the `tls-reload` sidecar (`root`). Compose is unchanged (plain). Backups, restores and PITR go through `kubectl exec` and the local socket, which `require_secure_transport` does not touch.

`db-migrate-user` binds each user to its certificate: `ALTER USER … REQUIRE ISSUER '/CN=trading-model-mysql-ca' AND SUBJECT '/CN=<user>'`. The password alone no longer opens a session. (Decision of the owner, 2026-11-09: certificate per service from cert-manager instead of the SPIFFE SVID, which MySQL cannot map to a user; ADR-0011 amended.)

## Rotation

1. cert-manager renews `mysql-tls` and the client certificates (clients read theirs when they start, and CronJobs at each run; a long-running financial-scraper pod keeps the certificate it loaded: the pods restart at each release, and `kubectl rollout restart deployment/financial-scraper deployment/financial-scraper-collector` before the 90 days otherwise); the kubelet refreshes the mounted Secret within about a minute.
2. The `tls-reload` sidecar of each pod hashes `tls.crt` every 60 s and runs `ALTER INSTANCE RELOAD TLS` when it changed (no restart; log `server certificate reloaded`, or `reload failed, retrying`). Check the served expiry: `kubectl exec mysql-0 -c mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW STATUS LIKE \"Ssl_server_not_after\""'`.
3. CA renewal (every ~4 years) is **not** zero-downtime: clients read `ca.crt` when they start, and the leaf is reissued by the new CA, so a client still holding the old CA fails the verification on every new connection until it restarts (open connections of a pool survive). Expected gap: about 1 to 3 minutes (kubelet refresh ≤ 1 min + sidecar tick ≤ 1 min + rollout), so plan it in a quiet window. Order: `kubectl cert-manager renew mysql-ca`, wait for the leaf (`kubectl get certificate mysql-tls` Ready), then at once `kubectl rollout restart deployment/financial-scraper deployment/financial-scraper-collector statefulset/mysql`. CronJobs started in the gap fail and run again at the next schedule. A two-CA bundle (trust-manager) would remove the gap; not adopted: one more cluster component for an event every four years. Not rehearsed in CI.

## Enforcement and upgrade

`require_secure_transport=ON` is set in `group-replication.cnf` (`mysql.yaml`). The release that introduces it rolls the MySQL pods once and runs `db-migrate-user`, which binds the users to their certificates: pods of the previous release (plain, no client certificate) lose their MySQL connection until they are replaced by the rolling update (brief interruption, accepted by the owner, 2026-11-09). `tests/k8s/run-kind.sh verify_mysql_tls` proves in the `k8s` CI job that a plain connection and a TLS connection without client certificate are refused.

On that first upgrade the migrations run before the overlay, while mysqld still serves its auto-generated certificate, which no client can verify. `run-migrations.sh` detects it (pod `mysql-0` without volume `mysql-tls`: read on the pod, since a partitioned StatefulSet keeps an older one, issue #1066) and runs the `db-migrate-user` / `db-migrate` jobs encrypted but unverified for that one run (`ssl-mode=REQUIRED` in `mysql-client-tls`, `DB_SSL_VERIFY=false` for `migrate.mjs`), without client certificate (the old server does not trust the cert-manager CA and would drop the session) and without `REQUIRE` on the users (`TLS_BIND=false`); the overlay re-applies `VERIFY_IDENTITY`, and once the rollout is done (`Bind MySQL users…` step of `deploy.yml`, `release()` of `run-kind.sh`) `run-migrations.sh <ns> user-only` binds the users. Later releases verify the certificate in the migration jobs too.

## Not covered

Redis, Sentinel and MongoDB are other issues (#930, #769).
