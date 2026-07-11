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
import { CertificateLifecycleOrchestrator } from "../../src/certificate-lifecycle-orchestrator";

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
		signWithCa:
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
	const mockEventEmitter = {
		notifyOnRenew:
			jest.fn<
				(onRenew: ((cert: any) => void) | undefined, cert: any) => void
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
		mockSigner.signWithCa.mockResolvedValue({
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
		orchestrator = new CertificateLifecycleOrchestrator(
			mockKeyGenerator as any,
			mockSigner as any,
			mockStore as any,
			mockEventEmitter as any,
			mockConfig
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("obtainCertificate", () => {
		it("should generate key, sign CSR, store cert, and return CertificateHolder", async () => {
			const holder: CertificateHolder = await orchestrator.obtainCertificate();

			expect(mockKeyGenerator.generateKeyAndCsr).toHaveBeenCalledTimes(1);
			expect(mockSigner.signWithCa).toHaveBeenCalledWith("csr-data");
			expect(mockStore.writeCertificates).toHaveBeenCalledWith(
				{ privateKey: "pk-pem" as any, publicKey: "pub-pem" as any },
				expect.objectContaining({ certPem: "cert-pem", caPem: "ca-pem" })
			);
			expect(mockStore.buildObtainedCert).toHaveBeenCalled();
			expect(mockEventEmitter.notifyOnRenew).toHaveBeenCalledWith(
				undefined,
				expect.objectContaining({ certPem: "cert-pem" })
			);
			expect(holder.getCurrentCert().certPem).toBe("cert-pem");
		});

		it("should use custom renewMarginMs when provided", async () => {
			const orchestratorWithCustomMargin = new CertificateLifecycleOrchestrator(
				mockKeyGenerator as any,
				mockSigner as any,
				mockStore as any,
				mockEventEmitter as any,
				{ ...mockConfig, renewMarginMs: 300000 }
			);
			const holder = await orchestratorWithCustomMargin.obtainCertificate();
			expect(holder.getCurrentCert().certPem).toBe("cert-pem");
		});

		it("should call onRenew callback via eventEmitter when configured", async () => {
			const onRenew = jest.fn();
			const orchestratorWithOnRenew = new CertificateLifecycleOrchestrator(
				mockKeyGenerator as any,
				mockSigner as any,
				mockStore as any,
				mockEventEmitter as any,
				{ ...mockConfig, onRenew }
			);
			await orchestratorWithOnRenew.obtainCertificate();
			expect(mockEventEmitter.notifyOnRenew).toHaveBeenCalledWith(
				onRenew,
				expect.any(Object)
			);
		});
	});
});
