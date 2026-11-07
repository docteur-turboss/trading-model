/**
 * How long a `POST /message` to message-manager may last (ADR-0043).
 *
 * The broker answers 202 as soon as the message is written to its durable
 * journal; delivery and retries run outside the request. The bound only has to
 * cover discovery, one journal write (replicated when configured) and the
 * network, so a publisher that waits longer is facing a broker that is down.
 */
export const PUBLISH_ACCEPT_TIMEOUT_MS = 15_000;

/**
 * Publisher-side bound kept for one release (expand/contract, ADR-0043): an
 * N-1 message-manager replica still answers after delivery, up to 300 s, so a
 * shorter bound would fail publishes the old broker goes on to deliver and open
 * the publishers' circuit breaker during a rolling update. Drop it to
 * `PUBLISH_ACCEPT_TIMEOUT_MS + 5_000` in the release after ADR-0043 ships.
 */
export const PUBLISH_COMPAT_TIMEOUT_MS = 305_000;
