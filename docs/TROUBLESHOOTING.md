# Troubleshooting

Common issues grouped by category.

---

## Docker / Docker Compose

| Symptom                     | Likely cause                                 | Fix                                                                                     |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `port is already allocated` | Local service (e.g. MySQL on 3306) conflicts | Stop the local service, or edit `.env` to use different host ports                      |
| Container exits immediately | Wrong `TLS_CERTS_DIR` in `.env`              | Ensure `.env` points to a directory with valid `server-key.pem`, `server.crt`, `ca.crt` |
| Containers keep restarting  | Service dependency not ready                 | Run `docker compose logs <service-name>` to see the specific error                      |
| `docker compose` not found  | Docker not installed or v1 syntax            | Install Docker Desktop or `docker-compose-v2` package                                   |
| First pull is very slow     | Initial download of database images          | This only happens once; subsequent runs use cached layers                               |
| `trading-network` conflict  | Previous network not cleaned up              | `docker network rm trading-network`                                                     |

---

## MySQL

| Symptom                                       | Likely cause              | Fix                                                                                  |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `ER_NOT_SUPPORTED_AUTH_MODE`                  | MySQL not initialized     | `docker compose down -v` then `docker compose up -d` to re-init                      |
| Table not found                               | `init-db.sql` not mounted | Check `docker compose config` shows the mount. Ensure `./scripts/init-db.sql` exists |
| `financial-scraper` fails with `ECONNREFUSED` | MySQL not healthy yet     | Wait — the service waits for health check. Check `docker compose logs mysql`         |
| MySQL fails to start                          | Port 3306 already used    | Stop local MySQL or change port mapping                                              |

---

## MongoDB

| Symptom                            | Likely cause          | Fix                                                                           |
| ---------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `message-manager` fails to connect | Mongo not started     | Check `docker compose logs mongo`                                             |
| Connection refused                 | Mongo not healthy yet | Wait for health check to pass                                                 |
| Data not persisted                 | Named volume removed  | Use `docker compose down` (keeps volumes) instead of `docker compose down -v` |

---

## TLS / Certificates

| Symptom                           | Likely cause                 | Fix                                                                            |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `ECONNREFUSED` on startup         | TLS certs missing or invalid | Run OpenSSL commands from QUICKSTART.md step 4                                 |
| Certificate errors in logs        | Wrong paths in `.env`        | Verify `TLS_CERTS_DIR` and that `server-key.pem`, `server.crt`, `ca.crt` exist |
| `wget` health check fails         | Self-signed cert not trusted | Expected for local dev — the health check uses `--no-check-certificate`        |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | mTLS misconfiguration        | Regenerate certificates matching the CA chain                                  |

---

## Node.js / npm

| Symptom                       | Likely cause              | Fix                                                                                 |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `npm ci` fails                | Node.js < 20              | Run `node --version`; install Node.js 20+                                           |
| `npm run build` fails         | Missing dependencies      | Run `npm ci` first (clean install from lockfile)                                    |
| Test coverage below threshold | New code not fully tested | Write tests for the uncovered paths. Run `npm test -- --coverage` to see the report |
| `command not found: eslint`   | `npm ci` not run          | Run `npm ci` to install dev dependencies                                            |

---

## Networking

| Symptom                                     | Likely cause               | Fix                                                                 |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Services can't reach each other             | Custom network conflict    | `docker network rm trading-network` and restart                     |
| `curl -k https://localhost:8443/ping` fails | Discovery server not ready | Wait for health check. Check `docker compose logs discovery-server` |
| Connection refused on all ports             | Docker not running         | Start Docker Desktop or the Docker daemon                           |

---

## Git / Hooks

| Symptom                       | Likely cause                      | Fix                                                             |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `husky` pre-commit hook fails | Commit message format invalid     | Use `npm run commit` (interactive). See STANDARDS.md for format |
| `commitlint` error            | Non-conventional commit           | Rewrite commit message. Format: `<gitmoji>(<scope>): <subject>` |
| Push rejected                 | Branch not up to date with `main` | `git pull --rebase origin main` and resolve conflicts           |

---

## Testing

| Symptom                     | Likely cause                    | Fix                                                          |
| --------------------------- | ------------------------------- | ------------------------------------------------------------ |
| Tests timeout               | Async operations not completing | Increase timeout with `jest.setTimeout(30000)` in the test   |
| Mock not called             | Mock setup before action        | Call `mockResolvedValue` before invoking the tested function |
| State leaking between tests | Shared mutable state            | Use `beforeEach` instead of `beforeAll` for test setup       |
| Flaky tests                 | Timing-dependent assertions     | Use event-based waits instead of fixed `setTimeout` delays   |

---

## Getting help

If the issue is not listed above:

1. Check `docker compose logs -f` for real-time errors from all services
2. Check a specific service: `docker compose logs <service-name>`
3. Verify your `.env` matches `.env.example`
4. Ensure TLS certificates are valid (not expired, paths are correct)
5. Open a GitHub issue with the full error message and `docker compose logs` output
