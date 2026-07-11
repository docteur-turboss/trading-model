import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { CertificateEvent } from "@trading-model/common/contracts/certificate-events";

const MOCK_ON = jest
	.fn<(...args: any[]) => () => void>()
	.mockReturnValue(jest.fn());
jest.mock("@trading-model/broker-message", () => ({
	EVENT_MANAGER: { on: MOCK_ON },
}));

jest.mock("@trading-model/certificate-utils/validate-certificate", () => ({
	clearValidationCache: jest.fn(),
}));

import { clearValidationCache } from "@trading-model/certificate-utils/validate-certificate";
import { subscribeToCertificateEvents } from "../../src/crl-subscriber";

describe("crl-subscriber", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should subscribe to certificate events and return cleanup function", async () => {
		const mockMessageManager = {
			intents: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined as any),
		};
		const cleanup = await subscribeToCertificateEvents(
			mockMessageManager as any
		);

		expect(mockMessageManager.intents).toHaveBeenCalled();
		expect(typeof cleanup).toBe("function");
	});

	it("should fire onCertificateRevoked callback", () => {
		const onCertificateRevoked = jest.fn();
		subscribeToCertificateEvents({ intents: jest.fn() } as any, {
			onCertificateRevoked,
		}).catch(() => {});

		const handler = MOCK_ON.mock.calls.find(
			(c: any[]) => c[0] === CertificateEvent.CertificateRevoked
		);
		if (handler) {
			handler[1]({
				serialNumber: "SN-001",
				serviceId: "svc-1",
				reason: "unspecified",
				revokedAt: 12345,
				instanceId: "i1",
			});
		}

		expect(clearValidationCache).toHaveBeenCalled();
		expect(onCertificateRevoked).toHaveBeenCalledWith(
			expect.objectContaining({
				serialNumber: "SN-001",
				serviceId: "svc-1",
			})
		);
	});

	it("should fire onCaKeyRotated callback", () => {
		const onCaKeyRotated = jest.fn();
		subscribeToCertificateEvents({ intents: jest.fn() } as any, {
			onCaKeyRotated,
		}).catch(() => {});

		const handler = MOCK_ON.mock.calls.find(
			(c: any[]) => c[0] === CertificateEvent.CaKeyRotated
		);
		if (handler) {
			handler[1]({ keyId: "key-1", keyVersion: "v2", instanceId: "i1" });
		}

		expect(clearValidationCache).toHaveBeenCalled();
		expect(onCaKeyRotated).toHaveBeenCalledWith(
			expect.objectContaining({ keyId: "key-1" })
		);
	});

	it("should work without callbacks", () => {
		subscribeToCertificateEvents({ intents: jest.fn() } as any).catch(() => {});

		const handler = MOCK_ON.mock.calls.find(
			(c: any[]) => c[0] === CertificateEvent.CertificateRevoked
		);
		if (handler) {
			handler[1]({
				serialNumber: "SN-001",
				serviceId: "svc-1",
				reason: "unspecified",
				revokedAt: 12345,
				instanceId: "i1",
			});
		}

		expect(clearValidationCache).toHaveBeenCalled();
	});

	it("should return cleanup that unsubscribes from events", async () => {
		const cleanupRevoked = jest.fn();
		const cleanupRotated = jest.fn();
		MOCK_ON.mockReturnValueOnce(cleanupRevoked).mockReturnValueOnce(
			cleanupRotated
		);

		const mockMessageManager = {
			intents: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined as any),
		};
		const cleanup = await subscribeToCertificateEvents(
			mockMessageManager as any
		);

		cleanup();

		expect(cleanupRevoked).toHaveBeenCalled();
		expect(cleanupRotated).toHaveBeenCalled();
	});
});
