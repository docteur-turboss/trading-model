/**
 * How long a `POST /message` to message-manager may last (ADR-0019).
 *
 * The broker answers once every delivery is acknowledged, dead-lettered or
 * given up, so the request lasts as long as the slowest subscriber's retries.
 * message-manager closes the request after this delay and checks that its
 * worst-case retry budget fits in it; publishers wait slightly longer so that
 * the broker's answer, not their own timeout, ends the request.
 */
export const PUBLISH_TIMEOUT_MS = 300_000;
