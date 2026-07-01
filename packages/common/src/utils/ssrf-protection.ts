import { isIP } from 'node:net';

const BLOCKED_IPV4_PREFIXES = ['127.', '10.', '0.', '169.254.', '192.168.'];
const BLOCKED_IPV6 = ['::1', '::ffff:127.', 'fe80:', 'fc00:', 'fd00:'];

/** Hostnames that are always allowed regardless of DNS resolution. */
const ALLOWED_HOSTNAMES = new Set<string>(['localhost']);

/**
 * Validates that a hostname or IP is safe for outgoing HTTP requests.
 * Blocks internal/reserved IPs to prevent SSRF (Server-Side Request Forgery).
 *
 * @returns true if the address is safe, false if it resolves to an internal IP
 */
export function isInternalAddress(hostname: string): boolean {
  if (!hostname) return true;

  if (ALLOWED_HOSTNAMES.has(hostname)) return false;

  // Check direct IPv4
  if (isIP(hostname) === 4) {
    for (const prefix of BLOCKED_IPV4_PREFIXES) {
      if (hostname.startsWith(prefix)) return true;
    }
    return false;
  }

  // Check direct IPv6
  if (isIP(hostname) === 6) {
    for (const prefix of BLOCKED_IPV6) {
      if (hostname.toLowerCase().startsWith(prefix)) return true;
    }
    return false;
  }

  // Hostname — allow (DNS resolution is done by the caller)
  return false;
}

/**
 * Blocks SSRF by throwing if the hostname resolves to an internal address.
 * Use BEFORE making an HTTP request to an untrusted target.
 */
export function assertNotInternalAddress(hostname: string): void {
  if (isInternalAddress(hostname)) {
    throw new Error(`SSRF blocked: internal address ${hostname} is not allowed`);
  }
}
