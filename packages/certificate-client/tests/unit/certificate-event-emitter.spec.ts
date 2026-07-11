import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { ObtainedCertificate } from "../../src/certificate-client";
import { CertificateEventEmitter } from "../../src/certificate-event-emitter";

afterEach(() => {
	jest.useFakeTimers();
	jest.useRealTimers();
});

describe("CertificateEventEmitter", () => {
	it("should call onRenew callback via setImmediate", async () => {
		const emitter = new CertificateEventEmitter();
		const onRenew = jest.fn();
		const cert = {
			certPem: "cert" as any,
			keyPem: "key" as never,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: new Date() as any,
		} satisfies ObtainedCertificate;

		emitter.notifyOnRenew(onRenew, cert);
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(onRenew).toHaveBeenCalledWith(cert);
	});

	it("should not throw when onRenew is undefined", () => {
		const emitter = new CertificateEventEmitter();
		const cert = {
			certPem: "cert" as any,
			keyPem: "key" as never,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: new Date() as any,
		} satisfies ObtainedCertificate;

		expect(() => emitter.notifyOnRenew(undefined, cert)).not.toThrow();
	});
});
