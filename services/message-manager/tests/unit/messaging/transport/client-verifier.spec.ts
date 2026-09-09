import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { describe, expect, it } from "@jest/globals";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { ClientVerifier } from "../../../../src/messaging/transport/client-verifier";

function mockSocket(cert?: unknown, authorized = true): TLSSocket {
	return {
		authorized,
		getPeerCertificate: () => cert,
	} as unknown as TLSSocket;
}

function mockReq(
	overrides?: Partial<Record<string, unknown>>
): IncomingMessage {
	return {
		headers: {},
		socket: mockSocket(),
		...overrides,
	} as unknown as IncomingMessage;
}

const SPIFFE_SAN =
	"URI:spiffe://trading-model.local/ns/trading-model/sa/message-manager";

describe("ClientVerifier", () => {
	describe("verifyClient", () => {
		it("should accept a peer presenting a SPIFFE SVID plus instance id", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				socket: mockSocket({ subjectaltname: SPIFFE_SAN }),
				headers: { "x-instance-id": "mm-1" },
			});
			const cb = jest.fn();
			verifier.verifyClient({ req }, cb);
			expect(cb).toHaveBeenCalledWith(true);
		});

		it("should reject a SPIFFE peer missing the instance id", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				socket: mockSocket({ subjectaltname: SPIFFE_SAN }),
				headers: {},
			});
			const cb = jest.fn();
			verifier.verifyClient({ req }, cb);
			expect(cb).toHaveBeenCalledWith(false, 400, expect.any(String));
		});

		it("should fall back to headers when no client certificate is presented", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				headers: { "x-service-name": "api-gateway", "x-instance-id": "gw-1" },
			});
			const cb = jest.fn();
			verifier.verifyClient({ req }, cb);
			expect(cb).toHaveBeenCalledWith(true);
		});

		it("should reject non-SPIFFE peers without headers", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				socket: mockSocket({ subject: { CN: "trading-discovery-1" } }),
				headers: {},
			});
			const cb = jest.fn();
			verifier.verifyClient({ req }, cb);
			expect(cb).toHaveBeenCalledWith(false, 400, expect.any(String));
		});
	});

	describe("parseConnectionHeaders", () => {
		it("should prefer the SPIFFE SVID identity over headers", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				socket: mockSocket({ subjectaltname: SPIFFE_SAN }),
				headers: {
					"x-service-name": "spoofed",
					"x-instance-id": "mm-1",
				},
			});
			const result = verifier.parseConnectionHeaders(req);
			expect(result.identity.serviceName).toBe(toServiceId("message-manager"));
			expect(result.identity.instanceId).toBe(toInstanceId("mm-1"));
		});

		it("should fall back to headers when no SVID is present", () => {
			const verifier = new ClientVerifier();
			const req = mockReq({
				headers: { "x-service-name": "api-gateway", "x-instance-id": "gw-1" },
			});
			const result = verifier.parseConnectionHeaders(req);
			expect(result.identity.serviceName).toBe(toServiceId("api-gateway"));
		});
	});
});
