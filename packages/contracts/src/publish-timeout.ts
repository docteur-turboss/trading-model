/**
 * How long a `POST /message` to message-manager may last (ADR-0043).
 *
 * The broker answers 202 as soon as the message is written to its durable
 * journal; delivery and retries run outside the request. The bound only has to
 * cover discovery, one journal write (replicated when configured) and the
 * network, so a publisher that waits longer is facing a broker that is down.
 */
export const PUBLISH_ACCEPT_TIMEOUT_MS = 15_000;
