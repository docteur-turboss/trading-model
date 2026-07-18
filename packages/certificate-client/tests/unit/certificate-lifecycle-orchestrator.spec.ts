import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { CertificateHolder } from "../../src/certificate-holder";
import {
	CertificateLifecycleOrchestrator,
	type LifecycleDeps,
} from "../../src/certificate-lifecycle-orchestrator";

describe("CertificateLifecycleOrchestrator", () => {
	const mockKeyGenerator = {
		generateKeyAndCsr:
			jest.fn<
				() => Promise<{
					keyPair: { privateKey: string; publicKey: string };
					csr: string;
				}>
			>(),
	};
	const mockSigner = {
		signCertificate:
			jest.fn<
				(csr: string) => Promise<{
					certPem: string;
					caPem: string;
					serialNumber: string;
					expiresAt: string;
				}>
			>(),
	};
	const mockStore = {
		writeCertificates:
			jest.fn<
				(
					keyPair: { privateKey: string; publicKey: string },
					response: { certPem: string; caPem: string }
				) => Promise<void>
			>(),
		buildObtainedCert:
			jest.fn<
				(
					keyPair: { privateKey: string; publicKey: string },
					response: {
						certPem: string;
						caPem: string;
						serialNumber: string;
						expiresAt: string;
					}
				) => {
					certPem: string;
					keyPem: string;
					caPem: string;
					serialNumber: string;
					expiresAt: number;
				}
			>(),
	};
	const mockConfig = {
		serviceId: "test-svc" as ServiceId,
		onRenew: undefined as ((cert: any) => void) | undefined,
		renewMarginMs: undefined as number | undefined,
	};

	let orchestrator: CertificateLifecycleOrchestrator;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		mockKeyGenerator.generateKeyAndCsr.mockResolvedValue({
			keyPair: { privateKey: "pk-pem" as never, publicKey: "pub-pem" as never },
			csr: "csr-data",
		});
		mockSigner.signCertificate.mockResolvedValue({
			certPem: "cert-pem" as any,
			caPem: "ca-pem" as any,
			serialNumber: "SN123" as any,
			expiresAt: "2027-06-15T00:00:00.000Z",
		});
		mockStore.buildObtainedCert.mockReturnValue({
			certPem: "cert-pem" as any,
			keyPem: "pk-pem" as never,
			caPem: "ca-pem" as any,
			serialNumber: "SN123" as any,
			expiresAt: 1234567890 as any,
		});
		mockStore.writeCertificates.mockResolvedValue(undefined as any);
		orchestrator = new CertificateLifecycleOrchestrator({
			keyGenerator: mockKeyGenerator as any,
			signer: mockSigner as any,
			store: mockStore as any,
			config: mockConfig,
		} satisfies LifecycleDeps);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("obtainCertificate", () => {
		it("should generate key, sign CSR, store cert, and return CertificateHolder", async () => {
			const holder: CertificateHolder = await orchestrator.obtainCertificate();

			expect(mockKeyGenerator.generateKeyAndCsr).toHaveBeenCalledTimes(1);
			expect(mockSigner.signCertificate).toHaveBeenCalledWith("csr-data");
			expect(mockStore.writeCertificates).toHaveBeenCalledWith(
				{ privateKey: "pk-pem" as any, publicKey: "pub-pem" as any },
				expect.objectContaining({ certPem: "cert-pem", caPem: "ca-pem" })
			);
			expect(mockStore.buildObtainedCert).toHaveBeenCalled();
			expect(holder.getCurrentCert().certPem).toBe("cert-pem");
		});

		it("should use custom renewMarginMs when provided", async () => {
			const orchestratorWithCustomMargin = new CertificateLifecycleOrchestrator(
				{
					keyGenerator: mockKeyGenerator as any,
					signer: mockSigner as any,
					store: mockStore as any,
					config: { ...mockConfig, renewMarginMs: 300000 },
				} satisfies LifecycleDeps
			);
			const holder = await orchestratorWithCustomMargin.obtainCertificate();
			expect(holder.getCurrentCert().certPem).toBe("cert-pem");
		});

		it("should call onRenew callback via setImmediate when configured", async () => {
			jest.useRealTimers();
			const onRenew = jest.fn();
			const orchestratorWithOnRenew = new CertificateLifecycleOrchestrator({
				keyGenerator: mockKeyGenerator as any,
				signer: mockSigner as any,
				store: mockStore as any,
				config: { ...mockConfig, onRenew },
			} satisfies LifecycleDeps);
			await orchestratorWithOnRenew.obtainCertificate();
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(onRenew).toHaveBeenCalledWith(
				expect.objectContaining({ certPem: "cert-pem" })
			);
		});
	});
});
