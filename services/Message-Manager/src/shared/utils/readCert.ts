import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads a certificate file from a given directory and returns its raw binary content.
 *
 * @description
 * This utility function is designed to load cryptographic certificate files
 * (e.g. `.pem`, `.crt`, `.key`) from the local filesystem.
 *
 * In production environments, certificates **must not be bundled in the source code**.
 * They are expected to be:
 * - Retrieved from a Secret Manager (Vault, AWS Secrets Manager, GCP Secret Manager, etc.)
 * - Or mounted as read-only volumes (Kubernetes, ECS, Nomad, Docker, etc.)
 *
 * This function performs a **synchronous file read** and is therefore intended
 * for usage during application bootstrap or initialization phases only.
 *
 * @function readCert
 *
 * @param {string} CERT_DIR
 * Absolute or relative path to the directory containing the certificate files.
 *
 * @param {string} filename
 * Name of the certificate file to read (including extension).
 *
 * @returns {Buffer}
 * A Node.js Buffer containing the raw binary content of the certificate file.
 *
 * @throws {Error}
 * Throws an error if:
 * - The directory does not exist
 * - The file does not exist
 * - The process lacks sufficient read permissions
 *
 * @example
 * ```ts
 * const caCert = readCert("/etc/certs", "ca.pem");
 * const clientKey = readCert(process.env.CERT_DIR!, "client.key");
 * ```
 *
 * @security
 * Ensure that:
 * - The certificate directory has restricted filesystem permissions
 * - The returned Buffer is never logged or exposed
 *
 * @author docteur-turboss
 *
 * @version
 * 1.0.0
 *
 * @since
 * 2026-01-24
 *
 * @see
 * https://nodejs.org/api/fs.html#fsreadfilesyncpath-options
 */
export function readCert(CERT_DIR: string, filename: string): Buffer {
  return readFileSync(path.join(CERT_DIR, filename));
}