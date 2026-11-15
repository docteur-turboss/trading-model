# Troubleshooting

Common issues grouped by category. For per-service debugging, see [Diagnostic Guide](diagnostic-guide.md). For an `AppError` code seen in a response or log, see the [error code catalog](../reference/error-codes.md).

---

## Docker / Docker Compose

| Symptom                           | Likely cause                                 | Fix                                                                                     |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `port is already allocated`       | Local service (e.g. MySQL on 3306) conflicts | Stop the local service, or edit `.env` to use different host ports                      |
| Container exits immediately       | SVID not ready yet on first boot             | Expected on first `docker compose up`: `spiffe-helper` writes the SVID, then the service restarts successfully |
| Containers keep restarting        | Service dependency not ready                 | Run `docker compose logs <service-name>` to see the specific error                      |
| `docker compose` not found        | Docker not installed or v1 syntax            | Install Docker Desktop or `docker-compose-v2` package                                   |
| First pull is very slow           | Initial download of database images          | This only happens once; subsequent runs use cached layers                               |
| `trading-network` conflict        | Previous network not cleaned up              | `docker network rm trading-network`                                                     |
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
| `Authentication failed` (audit-logger, dlq-service) | Volume created before authentication (ADR-0067) | `docker compose down -v`, or use the localhost exception (see the `mongo` service) |
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
| `wget` health check fails         | Self-signed SVID not trusted          | Expected: the health check uses `curl -sk` (skip server verify) with the container SVID as client certificate (`--cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem`); without it the mTLS handshake is refused |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | mTLS misconfiguration                 | Verify the service CA bundle (`bundle.pem`) matches the SPIRE trust domain      |
| SVID renewal failed               | SPIRE agent attestation problem       | Check `docker compose logs spire-agent`; rerun `docker compose up spire-bootstrap` to reconcile entries      |

---

## Bun

| Symptom                                                 | Likely cause                            | Fix                                                                             |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile` fails                                          | Bun outdated / unsupported platform     | Run `bun --version`; update Bun (`bun upgrade`)                                 |
| `bun run build` fails                                   | Missing dependencies                    | Run `bun install --frozen-lockfile` first (clean install from lockfile)                                |
| Test coverage below threshold                           | New code not fully tested               | Write tests for uncovered paths. Run `bun run test --coverage` to see the report |
| `command not found: biome`                              | `bun install --frozen-lockfile` not run                        | Run `bun install --frozen-lockfile` to install dev dependencies                                        |
| `bun install --frozen-lockfile` fails with `Missing: <package> from lock file` | Lock file out of sync with package.json | Run `bun install` to update lock file                                           |

---

## TypeDoc / JSDoc

| Symptom                                      | Likely cause                 | Fix                                                                                        |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `@description` tag warning in TypeDoc output | Redundant `@description` tag | Remove `@description` — TypeDoc uses the first JSDoc line as the description automatically |
| `Warning: @param name not found`             | Param name mismatch          | Ensure `@param` names match the function signature exactly                                 |

---

## Biome / VS Code

| Issue                                                                        | Cause                                  | Solution                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Biome not running in VS Code                                                 | Biome VS Code extension not installed  | Install `biomejs.biome` extension from marketplace       |
| Biome format conflicts with editor settings                                  | Editor uses default formatter          | Set `"editor.defaultFormatter": "biomejs.biome"` in settings |
| `Parsing error: Cannot find module 'typescript'`            | TypeScript not installed in workspace                 | Run `bun install --frozen-lockfile` to install dependencies                                                    |

---

## Networking

| Symptom                                     | Likely cause               | Fix                                                                                     |
| ------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Services can't reach each other             | Custom network conflict    | `docker network rm trading-network` and restart                                         |
| `curl -k` (no `--cert`) to a service `/ping` fails | Expected: no client SVID   | Services only accept SPIFFE mTLS clients. Use `docker exec trading-discovery curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping`, or the gateway through `http://localhost:8449/v1/...` |
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

## Testing

| Symptom                     | Likely cause                    | Fix                                                          |
| --------------------------- | ------------------------------- | ------------------------------------------------------------ |
| Tests timeout               | Async operations not completing | Increase timeout with `jest.setTimeout(30000)` in the test   |
| Mock not called             | Mock setup before action        | Call `mockResolvedValue` before invoking the tested function |
| State leaking between tests | Shared mutable state            | Use `beforeEach` instead of `beforeAll` for test setup       |
| Flaky tests                 | Timing-dependent assertions     | Use event-based waits instead of fixed `setTimeout` delays   |
| `jest` command not found    | Dev dependencies not installed  | Run `bun install --frozen-lockfile` to install dev dependencies including Jest      |

---

## Getting help

If the issue is not listed above:

1. Check `docker compose logs -f` for real-time errors from all services
2. Check a specific service: `docker compose logs <service-name>`
3. Verify your `.env` matches `.env.example`
4. Ensure SPIRE is healthy (`docker compose logs spire-agent`) and SVIDs exist (`docker compose logs spiffe-helper-<svc>`)
5. Open a GitHub issue with the full error message and `docker compose logs` output
