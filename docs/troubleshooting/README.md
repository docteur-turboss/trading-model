# Troubleshooting

Common issues grouped by category. For per-service debugging, see the [runbooks](../operations/runbooks/). For an `AppError` code seen in a response or log, see the [error code catalog](../reference/error-codes.md).

---

## Docker / Docker Compose

| Symptom                           | Likely cause                                 | Fix                                                                                     |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `port is already allocated`       | Local service (e.g. MySQL on 3306) conflicts | Stop the local service, or edit `.env` to use different host ports                      |
| Container exits immediately       | SVID not ready yet on first boot             | Expected on first `docker compose up`: `spiffe-helper` writes the SVID, then the service restarts successfully |
| Containers keep restarting        | Service dependency not ready                 | Run `docker compose logs <service-name>` to see the specific error                      |
| `docker compose` not found        | Docker not installed or v1 syntax            | Install Docker Desktop or `docker-compose-v2` package                                   |
| First pull is very slow           | Initial download of database images          | This only happens once; subsequent runs use cached layers                               |
| `docker compose build` slow       | Large build context                          | Ensure `.dockerignore` is correct                                                       |
| Containers have no network access | Docker DNS misconfiguration                  | Check `/etc/docker/daemon.json` DNS settings, restart Docker                            |

---

## MySQL

| Symptom                                       | Likely cause              | Fix                                                                                  |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `ER_NOT_SUPPORTED_AUTH_MODE`                  | MySQL not initialized     | `docker compose down -v` then `docker compose up -d` to re-init                      |
| Table not found                               | Migrations not applied       | `docker compose up -d` runs the `migrate` service; check `docker compose logs migrate` |
| `financial-scraper` fails with `ECONNREFUSED` | MySQL not healthy yet     | Wait — the service waits for health check. Check `docker compose logs mysql`         |
| MySQL fails to start                          | Port 3306 already used    | Stop local MySQL or change port mapping                                              |
| `Access denied for user`                      | Wrong password in `.env`  | Verify `MYSQL_ROOT_PASSWORD` matches between `.env` and `docker-compose.yml`         |
| Data lost after restart                       | Volume removed            | Use `docker compose down` (keeps volumes) instead of `docker compose down -v`        |

---

## MongoDB

| Symptom                            | Likely cause                              | Fix                                                                           |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `Authentication failed` (audit-logger) | Volume created before authentication (ADR-0067) | `docker compose down -v`, or use the localhost exception (see the `mongo` service) |
| Connection refused                 | Mongo not healthy yet                     | Wait for health check to pass                                                 |
| Data not persisted                 | Named volume removed                      | Use `docker compose down` (keeps volumes) instead of `docker compose down -v` |
| `mongosh` not found in container   | Mongo 7 uses `mongosh` instead of `mongo` | The health check already uses `mongosh`; verify image is `mongo:7`            |

---

## Edge proxy

| Symptom                                   | Likely cause                                   | Fix                                                                                   |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `502 Bad Gateway` on `/v1/...`            | api-gateway down, or no SVID in `svid-edge`    | `docker compose logs edge-proxy spiffe-helper-edge`; check `api-gateway` health       |
| `403` from the gateway                    | Caller identity not in the gateway ACL         | The ACL allows only `edge-proxy` (`acl-config.ts`); check the SPIRE entry `spiffe-helper-edge` |
| `401` on `/v1/...`                        | Missing or unknown `x-api-key`                 | Use a value of the gateway's `AUTH_TOKENS`                                            |
| `404` on any path but `/v<n>`, `/ping`    | Expected: no UI is served (ADR-0018)           | —                                                                                     |

---

## TLS / SSL

| Symptom                           | Likely cause                          | Fix                                                                            |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `ECONNREFUSED` on startup         | SVID not written yet / SPIRE not ready| Check `docker compose logs spiffe-helper-<svc>` and `spire-agent`; wait for entries |
| Certificate errors in logs        | Stale SVID or missing bundle          | `docker compose restart <svc>` to re-fetch the SVID via `spiffe-helper`         |
| `wget` health check fails         | Self-signed SVID not trusted          | Expected: the health check uses `node -e` (skip server verify) with the container SVID as client certificate (`cert` / `key` read from `/run/spire/svid/`); without it the mTLS handshake is refused |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | mTLS misconfiguration                 | Verify the service CA bundle (`bundle.pem`) matches the SPIRE trust domain      |
| SVID renewal failed               | SPIRE agent attestation problem       | Check `docker compose logs spire-agent`; redeploy the release with the `deploy-compose.yml` workflow (it runs `spire-bootstrap` before `spire-agent`: fresh token and bundle; the agent drops an expired cached SVID itself)      |

---

## TypeDoc / JSDoc

| Symptom                                      | Likely cause                 | Fix                                                                                        |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `@description` tag warning in TypeDoc output | Redundant `@description` tag | Remove `@description` — TypeDoc uses the first JSDoc line as the description automatically |
| `Warning: @param name not found`             | Param name mismatch          | Ensure `@param` names match the function signature exactly                                 |

---

## Networking

| Symptom                                     | Likely cause               | Fix                                                                                     |
| ------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `curl -k` (no `--cert`) to a service `/ping` fails | Expected: no client SVID   | Services only accept SPIFFE mTLS clients. Use `docker exec trading-discovery node -e "$SVID_GET" https://localhost:3000/ping`, or the gateway through `http://localhost:8449/v1/...` |
| Connection refused on all ports             | Docker not running         | Start Docker Desktop or the Docker daemon                                               |
| DNS resolution fails inside containers      | Docker DNS config          | Edit `/etc/docker/daemon.json`: `{ "dns": ["1.1.1.1", "8.8.8.8"] }` then restart Docker |

---

## Git / Hooks

| Symptom                       | Likely cause                      | Fix                                                             |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `husky` `commit-msg` hook fails | Commit message format invalid     | Use `bun run commit` (interactive). See [commit standards](../standards/commit-standards.md) |
| `commitlint` error            | Non-conventional commit           | Rewrite commit message. Format: `<gitmoji>(<scope>): <subject>` |
| Push rejected                 | Branch not up to date with `development` | `git pull --rebase origin development` and resolve conflicts           |
| `husky` not running           | Git hooks path not set            | Run `bunx husky install` or `git config core.hooksPath .husky`   |
| `LF will be replaced by CRLF` | Line ending mismatch              | `git config core.autocrlf false` in the repo, see [Windows line endings](../getting-started/quickstart.md#windows-line-endings) |
| `bun run lint` fails on formatting on Windows, CI passes | Working tree checked out with CRLF | Renormalize the checkout, see [Windows line endings](../getting-started/quickstart.md#windows-line-endings) |

---

## Getting help

If the issue is not listed above:

1. Check `docker compose logs -f` for real-time errors from all services
2. Check a specific service: `docker compose logs <service-name>`
3. Verify your `.env` matches `.env.example`
4. Ensure SPIRE is healthy (`docker compose logs spire-agent`) and SVIDs exist (`docker compose logs spiffe-helper-<svc>`)
5. Open a GitHub issue with the full error message and `docker compose logs` output
