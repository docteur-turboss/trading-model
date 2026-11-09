# MySQL client TLS (issue #767)

Server certificate issued by **cert-manager** from an internal CA; every client verifies the host name. Prerequisite: cert-manager and its CRDs in the cluster (`check-prereqs.sh` fails the deploy otherwise; kind CI installs it in `tests/k8s/run-kind.sh cluster`).

## What exists

| Object | Role |
|---|---|
| Issuer `mysql-selfsigned`, Certificate `mysql-ca` (5 years, renewed 90 days before), Issuer `mysql-ca` | internal CA |
| Certificate `mysql-tls` (90 days, renewed 30 days before, new key each time) → Secret `mysql-tls` | server certificate; SANs `mysql`, `mysql-primary`, `mysql-headless`, `*.mysql-headless`, `localhost`, `127.0.0.1` |
| ConfigMap `mysql-client-tls` | `my.cnf` of the CLI clients (`MYSQL_HOME=/etc/mysql-client`: `ssl-mode=VERIFY_IDENTITY`), `exporter.cnf` |

Clients mount only `ca.crt` of `mysql-tls`: financial-scraper and its collector (`DB_SSL_CA`), migration Jobs (`DB_SSL_CA`), `db-migrate-user`, `mysql-cluster-init`, `db-retention`, SPIRE server (`root_ca_path`), mysqld-exporter. Compose is unchanged (plain). Backups, restores and PITR go through `kubectl exec` and the local socket.

## Rotation

1. cert-manager renews `mysql-tls`; the kubelet refreshes the mounted Secret within about a minute.
2. Make each member read it, one pod at a time: `kubectl exec mysql-N -c mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "ALTER INSTANCE RELOAD TLS"'` (no restart). Without it mysqld keeps serving the old certificate until it expires: `kubectl exec mysql-0 -c mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW STATUS LIKE \"Ssl_server_not_after\""'`.
3. CA renewal (every ~4 years): the CA Secret changes, so the leaf is reissued with it. Restart the clients (`kubectl rollout restart deployment/financial-scraper deployment/financial-scraper-collector`, `statefulset/mysql`, SPIRE server) so they read the new `ca.crt`; run `kubectl cert-manager renew mysql-tls` first if the leaf has not followed yet.

## Contract step (next release)

The expand release accepts plain connections so that N-1 pods keep working during the rolling update. Once N is deployed everywhere: add `require_secure_transport=ON` to `group-replication.cnf` (`mysql.yaml`), then correct the MySQL line of `docs/compliance/*`. `tests/k8s/run-kind.sh verify_mysql_tls` already expects a plain connection to be refused exactly when the variable is ON.

## Not covered

MySQL does not authenticate clients by certificate (SVID or other): passwords stay. Redis, Sentinel and MongoDB are other issues (#768, #769).
