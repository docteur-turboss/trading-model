import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { ObtainedCertificate } from "../../src/certificate-client";
import { notifyOnRenew } from "../../src/certificate-event-emitter";

afterEach(() => {
	jest.useFakeTimers();
	jest.useRealTimers();
});

describe("notifyOnRenew", () => {
	it("should call onRenew callback via setImmediate", async () => {
		const onRenew = jest.fn();
		const cert = {
			certPem: "cert" as any,
			keyPem: "key" as never,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: new Date() as any,
		} satisfies ObtainedCertificate;

		notifyOnRenew(onRenew, cert);
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(onRenew).toHaveBeenCalledWith(cert);
	});

	it("should not throw when onRenew is undefined", () => {
		const cert = {
			certPem: "cert" as any,
			keyPem: "key" as never,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: new Date() as any,
		} satisfies ObtainedCertificate;

		expect(() => notifyOnRenew(undefined, cert)).not.toThrow();
	});
});
