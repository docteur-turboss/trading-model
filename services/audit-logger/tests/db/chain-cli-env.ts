import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Env every service's ENV schema requires. The address manager loads the TLS
 * files at import, so a throwaway self-signed pair is generated (never used
 * to connect: chain-cli does not call other services).
 */
export function serviceEnv(): Record<string, string> {
	const dir = mkdtempSync(join(tmpdir(), "chain-cli-tls-"));
	const key = join(dir, "key.pem");
	const cert = join(dir, "cert.pem");
	execFileSync(
		"openssl",
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=chain-cli-test",
			"-keyout",
			key,
			"-out",
			cert,
		],
		{ stdio: "ignore" }
	);
	return {
		TLS_KEY_PATH: key,
		TLS_CERT_PATH: cert,
		TLS_CA_PATH: cert,
		APP_NAME: "audit-logger",
		SERVICE_NAME: "audit-logger",
		INSTANCE_ID: "audit-logger-cli-test",
		ADDRESS_MANAGER_URL: "http://127.0.0.1:1",
	};
}
