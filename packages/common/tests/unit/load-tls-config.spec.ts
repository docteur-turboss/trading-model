import { describe, expect, it } from "@jest/globals";
import { loadTlsConfig } from "@trading-model/server-utils/server/load-tls-config";
import type { FilePath } from "../../src/domain/primitives";

describe("loadTlsConfig", () => {
	it("should return TLS config from paths", () => {
		const paths = {
			keyPath: "/etc/tls/key.pem" as FilePath,
			certPath: "/etc/tls/cert.pem" as FilePath,
			caPath: "/etc/tls/ca.pem" as FilePath,
		};
		const result = loadTlsConfig(paths);

		expect(result).toBe(paths);
	});

	it("should return TLS config with special characters in paths", () => {
		const paths = {
			keyPath: "C:\\Program Files\\app\\tls\\key.pem" as FilePath,
			certPath: "/path/with spaces/cert.pem" as FilePath,
			caPath: "/path/with/dashes/ca.pem" as FilePath,
		};
		const result = loadTlsConfig(paths);

		expect(result).toEqual(paths);
	});
});
