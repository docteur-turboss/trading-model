import { describe, expect, it, jest } from "@jest/globals";

const TLS_ENV = {
	TLS_KEY_PATH: "/run/spire/svid/svid_key.pem",
	TLS_CERT_PATH: "/run/spire/svid/svid.pem",
	TLS_CA_PATH: "/run/spire/svid/bundle.pem",
};

jest.mock("../../src/infrastructure/config/env", () => ({ ENV: TLS_ENV }));

const mockCreateWithTls = jest.fn(() => ({ get: jest.fn() }));
jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: { createWithTls: mockCreateWithTls },
}));

import { createDiscoveryClient } from "../../src/config/container";

describe("createDiscoveryClient", () => {
	// A bare HttpClient presented no SVID: the readiness probe and the service
	// resolution never completed the mTLS handshake with discovery.
	it("builds the discovery client with the SVID and trust bundle", () => {
		createDiscoveryClient(TLS_ENV);

		expect(mockCreateWithTls).toHaveBeenCalledWith({
			keyPath: TLS_ENV.TLS_KEY_PATH,
			certPath: TLS_ENV.TLS_CERT_PATH,
			caPath: TLS_ENV.TLS_CA_PATH,
		});
	});
});
