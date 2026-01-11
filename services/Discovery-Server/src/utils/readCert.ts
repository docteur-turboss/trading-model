import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Configuration
 * In production, certificates must come from:
 * - a Secret Manager
 * - or be mounted in volume (K8s, ECS, Nomad, etc.)
 */
export function readCert(CERT_DIR: string, filename: string): Buffer {
  return readFileSync(path.join(CERT_DIR, filename));
}