import { describe, expect, it, jest } from "@jest/globals";
import { createReq } from "../helpers/express";

jest.mock("@trading-model/http/infrastructure/http-tls-loader", () => ({
	buildHttpsAgentOptions: jest.fn(() => ({
		ca: "ca-pem",
		cert: "cert-pem",
		key: "key-pem",
		checkServerIdentity: () => undefined,
	})),
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		PROXY_TIMEOUT_MS: 10000,
		TLS_KEY_PATH: "/run/spire/svid/svid_key.pem",
		TLS_CERT_PATH: "/run/spire/svid/svid.pem",
		TLS_CA_PATH: "/run/spire/svid/bundle.pem",
	},
}));

import { buildHttpsAgentOptions } from "@trading-model/http/infrastructure/http-tls-loader";
import { tlsOptionsBuilder } from "../../src/adapters/outbound/proxy-options-builder";

const TARGET = { host: "10.0.1.5", port: 3000, version: "1.0.0" } as never;

describe("tlsOptionsBuilder", () => {
	it("attaches the gateway SVID to outbound proxy requests", () => {
		const options = tlsOptionsBuilder.buildOptions({
			req: createReq(),
			target: TARGET,
			path: "/v1/api/data",
		});

		expect(buildHttpsAgentOptions).toHaveBeenCalled();
		expect(options.cert).toBe("cert-pem");
		expect(options.key).toBe("key-pem");
		expect(options.ca).toBe("ca-pem");
		expect(options.rejectUnauthorized).toBe(true);
	});
});
