import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { FilePath, URLString } from "@trading-model/common/domain/primitives";

jest.mock("node:fs/promises", () => ({
	access: jest.fn(),
	mkdir: jest.fn(),
	writeFile: jest.fn(),
}));

jest.mock("@trading-model/certificate-utils/async", () => ({
	generateKeyPairAsync: jest.fn(),
	createCsrAsync: jest.fn(),
}));

jest.mock("@trading-model/certificate-utils/generate-key-pair", () => ({
	KeyAlgorithm: { ecP384: "ec-p384" },
}));

const MOCK_SIGN_CERTIFICATE = jest.fn();
jest.mock("@trading-model/common/ca/ca-client", () => ({
	CaClient: jest.fn(() => ({
		signCertificate: MOCK_SIGN_CERTIFICATE,
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

const MOCK_HOLDER = {
	startAutoRenew: jest.fn(),
	stopAutoRenew: jest.fn(),
	getCurrentCert: jest.fn(),
};
const MOCK_CERTIFICATE_CLIENT_INSTANCE = {
	startAutoRenew: jest.fn(),
	obtainCertificate: jest.fn(() => Promise.resolve(MOCK_HOLDER)),
	stopAutoRenew: jest.fn(),
	getCurrentCert: jest.fn(),
};
const MOCK_CERTIFICATE_CLIENT = jest.fn(() => MOCK_CERTIFICATE_CLIENT_INSTANCE);
jest.mock("../../src/certificate-client", () => ({
	CertificateClient: MOCK_CERTIFICATE_CLIENT,
}));

const MOCK_APP = { use: jest.fn() };
const MOCK_CONFIGURE_APP = jest.fn((..._args: any[]) => MOCK_APP);
jest.mock("@trading-model/common/server/configure-app", () => ({
	configureApp: MOCK_CONFIGURE_APP,
}));

const MOCK_MTLS_AUTH_MIDDLEWARE = jest.fn();
jest.mock("@trading-model/common/middleware/mtls-auth", () => ({
	MTLSAuthMiddleware: MOCK_MTLS_AUTH_MIDDLEWARE,
}));

const MOCK_RESPONSE_PROTOCOL = jest.fn();
jest.mock("@trading-model/common/middleware/response-protocol", () => ({
	ResponseProtocol: MOCK_RESPONSE_PROTOCOL,
}));

const MOCK_HTTPS_SERVER = { raw: { setSecureContext: jest.fn() } };
const MOCK_CREATE_AND_START_HTTPS_SERVER = jest.fn((..._args: any[]) =>
	Promise.resolve(MOCK_HTTPS_SERVER)
);
jest.mock("@trading-model/common/server/server-factory", () => ({
	createAndStartHttpsServer: MOCK_CREATE_AND_START_HTTPS_SERVER,
}));

import fs from "node:fs/promises";
import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { logger } from "@trading-model/common/config/logger";
import {
	bootstrapCertificate,
	bootstrapConfigFromEnv,
	bootstrapFromEnv,
	createHttpsServer,
	createTlsBootstrap,
} from "../../src/certificate-bootstrap";

function mockResolved<T>(mock: unknown, value: T): void {
	(mock as any).mockResolvedValue(value);
}

function mockRejected(mock: unknown, error: Error): void {
	(mock as any).mockRejectedValue(error);
}

afterEach(() => {
	jest.useRealTimers();
});

describe("bootstrapConfigFromEnv", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return null when CERT_CLIENT_CA_URL is not set", () => {
		const result = bootstrapConfigFromEnv({});
		expect(result).toBeNull();
	});

	it("should return config when CERT_CLIENT_CA_URL is set", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CERT_CLIENT_SERVICE_ID: "my-service",
			CERT_CLIENT_COMMON_NAME: "my-common-name",
			CERT_CLIENT_SANS: "svc1,svc2,localhost",
		});
		expect(result!.caUrl).toBe("https://ca:8447");
		expect(result!.serviceId).toBe("my-service");
		expect(result!.commonName).toBe("my-common-name");
		expect(result!.san).toEqual(["svc1", "svc2", "localhost"]);
	});

	it("should fall back to APP_NAME for serviceId", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			APP_NAME: "my-app",
		});
		expect(result!.serviceId).toBe("my-app");
	});

	it("should default to unknown when no serviceId source exists", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		expect(result!.serviceId).toBe("unknown");
	});

	it("should use serviceId as default commonName", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CERT_CLIENT_SERVICE_ID: "my-service",
		});
		expect(result!.commonName).toBe("my-service");
	});

	it("should use default TLS paths", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		expect(result!.tlsPaths.certPath).toBe("/etc/tls/cert.pem");
		expect(result!.tlsPaths.keyPath).toBe("/etc/tls/key.pem");
		expect(result!.tlsPaths.caPath).toBe("/etc/tls/ca.pem");
	});

	it("should use TLS paths from env", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			TLS_CERT_PATH: "/custom/cert.pem",
			TLS_KEY_PATH: "/custom/key.pem",
			TLS_CA_PATH: "/custom/ca.pem",
		});
		expect(result!.tlsPaths.certPath).toBe("/custom/cert.pem");
		expect(result!.tlsPaths.keyPath).toBe("/custom/key.pem");
		expect(result!.tlsPaths.caPath).toBe("/custom/ca.pem");
	});

	it("should configure mTLS when CA_CLIENT_TLS_KEY is provided", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CA_CLIENT_TLS_KEY: "key-content",
			CA_CLIENT_TLS_CERT: "cert-content",
			CA_CLIENT_TLS_CA: "ca-content",
		});
		expect(result!.tls).toEqual({
			keyPath: "key-content",
			certPath: "cert-content",
			caPath: "ca-content",
		});
	});

	it("should not configure mTLS when CA_CLIENT_TLS_KEY is missing", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		expect(result!.tls).toBeUndefined();
	});

	it("should default mTLS cert and ca to empty when only key is set", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CA_CLIENT_TLS_KEY: "key-content",
		});
		expect(result!.tls).toEqual({
			keyPath: "key-content",
			certPath: "/etc/tls/client.crt",
			caPath: "/etc/tls/client-ca.crt",
		});
	});

	it("should pass bootstrapToken when set", () => {
		const result = bootstrapConfigFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CERT_CLIENT_BOOTSTRAP_TOKEN: "my-token",
		});
		expect(result!.bootstrapToken).toBe("my-token");
	});
});

describe("bootstrapFromEnv", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should do nothing when CERT_CLIENT_CA_URL is not set", async () => {
		await bootstrapFromEnv({});
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("should bootstrap when CERT_CLIENT_CA_URL is set", async () => {
		mockResolved(generateKeyPairAsync, { privateKey: "pk" });
		mockResolved(
			createCsrAsync,
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
		);
		mockResolved(MOCK_SIGN_CERTIFICATE, {
			certPem: "cert",
			caPem: "ca",
			serialNumber: "sn",
			expiresAt: new Date("2027-01-01").toISOString(),
		});
		mockRejected(fs.access, new Error("ENOENT"));

		await bootstrapFromEnv({
			CERT_CLIENT_CA_URL: "https://ca:8447",
			CERT_CLIENT_SERVICE_ID: "my-service",
		});

		expect(generateKeyPairAsync).toHaveBeenCalled();
		expect(createCsrAsync).toHaveBeenCalled();
		expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalled();
		expect(fs.writeFile).toHaveBeenCalledTimes(3);
	});
});

describe("bootstrapCertificate", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should skip bootstrap when cert and key already exist", async () => {
		mockResolved(fs.access, undefined);

		await bootstrapCertificate({
			caUrl: URLString.of("https://ca:8447"),
			serviceId: "svc",
			commonName: "svc",
			san: ["svc"],
			tlsPaths: {
				certPath: FilePath.of("/etc/tls/cert.pem"),
				keyPath: FilePath.of("/etc/tls/key.pem"),
				caPath: FilePath.of("/etc/tls/ca.pem"),
			},
		});

		expect(generateKeyPairAsync).not.toHaveBeenCalled();
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("should bootstrap when cert and key do not exist", async () => {
		mockRejected(fs.access, new Error("ENOENT"));
		mockResolved(generateKeyPairAsync, { privateKey: "pk" });
		mockResolved(
			createCsrAsync,
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
		);
		mockResolved(MOCK_SIGN_CERTIFICATE, {
			certPem: "cert",
			caPem: "ca",
			serialNumber: "sn",
			expiresAt: "2027-01-01T00:00:00.000Z",
		});

		await bootstrapCertificate({
			caUrl: URLString.of("https://ca:8447"),
			serviceId: "svc",
			commonName: "svc",
			san: ["svc"],
			tlsPaths: {
				certPath: FilePath.of("/etc/tls/cert.pem"),
				keyPath: FilePath.of("/etc/tls/key.pem"),
				caPath: FilePath.of("/etc/tls/ca.pem"),
			},
		});

		expect(generateKeyPairAsync).toHaveBeenCalled();
		expect(createCsrAsync).toHaveBeenCalled();
		expect(fs.writeFile).toHaveBeenCalledTimes(3);
		expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/key.pem", "pk", {
			mode: 0o600,
		});
		expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/cert.pem", "cert", {
			mode: 0o644,
		});
		expect(fs.writeFile).toHaveBeenCalledWith("/etc/tls/ca.pem", "ca", {
			mode: 0o644,
		});
	});

	it("should pass bootstrapToken to signCertificate", async () => {
		mockRejected(fs.access, new Error("ENOENT"));
		mockResolved(generateKeyPairAsync, { privateKey: "pk" });
		mockResolved(
			createCsrAsync,
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
		);
		mockResolved(MOCK_SIGN_CERTIFICATE, {
			certPem: "cert",
			caPem: "ca",
			serialNumber: "sn",
			expiresAt: "2027-01-01T00:00:00.000Z",
		});

		await bootstrapCertificate({
			caUrl: URLString.of("https://ca:8447"),
			serviceId: "svc",
			commonName: "svc",
			san: ["svc"],
			tlsPaths: {
				certPath: FilePath.of("/etc/tls/cert.pem"),
				keyPath: FilePath.of("/etc/tls/key.pem"),
				caPath: FilePath.of("/etc/tls/ca.pem"),
			},
			bootstrapToken: "btoken",
		});

		expect(MOCK_SIGN_CERTIFICATE).toHaveBeenCalledWith({
			serviceId: "svc",
			csr: "-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----",
			bootstrapToken: "btoken",
		});
	});
});

describe("createTlsBootstrap", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return null when CERT_CLIENT_CA_URL is not set", () => {
		const result = createTlsBootstrap({});
		expect(result).toBeNull();
	});

	it("should return TlsBootstrapOptions with ensure and setupAutoRenew when configured", () => {
		const result = createTlsBootstrap({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		expect(result).not.toBeNull();
		expect(typeof (result as any).ensure).toBe("function");
		expect(typeof (result as any).setupAutoRenew).toBe("function");
	});

	it("ensure should call bootstrapCertificate with the resolved config", async () => {
		mockResolved(fs.access, undefined);

		const result = createTlsBootstrap({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		await (result as any).ensure();

		expect(fs.access).toHaveBeenCalledWith("/etc/tls/cert.pem");
		expect(fs.access).toHaveBeenCalledWith("/etc/tls/key.pem");
	});

	it("setupAutoRenew should create CertificateClient and schedule startAutoRenew after 1s", async () => {
		jest.useFakeTimers();
		const server = { setSecureContext: jest.fn() };

		const result = createTlsBootstrap({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		(result as any).setupAutoRenew(server);

		expect(MOCK_CERTIFICATE_CLIENT).toHaveBeenCalledTimes(1);
		const configArg = (MOCK_CERTIFICATE_CLIENT as any).mock.calls[0][0] as any;
		expect(configArg.caUrl).toBe("https://ca:8447");
		expect(configArg.serviceId).toBe("unknown");
		expect(typeof configArg.onRenew).toBe("function");

		await Promise.resolve();
		jest.advanceTimersByTime(1000);
		expect(MOCK_HOLDER.startAutoRenew).toHaveBeenCalledTimes(1);

		jest.useRealTimers();
	});

	it("setupAutoRenew onRenew should call setSecureContext and log on success", () => {
		jest.useFakeTimers();
		const server = { setSecureContext: jest.fn() };

		const result = createTlsBootstrap({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		(result as any).setupAutoRenew(server);

		const { onRenew } = (MOCK_CERTIFICATE_CLIENT as any).mock
			.calls[0][0] as any;
		onRenew({ keyPem: "key", certPem: "cert", caPem: "ca" });

		expect(server.setSecureContext).toHaveBeenCalledWith({
			key: "key",
			cert: "cert",
			ca: "ca",
		});
		expect(logger.info).toHaveBeenCalledWith(
			"TLS context hot-reloaded after certificate renewal"
		);
		jest.useRealTimers();
	});

	it("setupAutoRenew onRenew should log error when setSecureContext throws", () => {
		jest.useFakeTimers();
		const server = {
			setSecureContext: jest.fn(() => {
				throw new Error("boom");
			}),
		};

		const result = createTlsBootstrap({
			CERT_CLIENT_CA_URL: "https://ca:8447",
		});
		(result as any).setupAutoRenew(server);

		const { onRenew } = (MOCK_CERTIFICATE_CLIENT as any).mock
			.calls[0][0] as any;
		onRenew({ keyPem: "key", certPem: "cert", caPem: "ca" });

		expect(logger.error).toHaveBeenCalledWith(
			"Failed to hot-reload TLS context",
			{
				err: expect.any(Error),
			}
		);
		jest.useRealTimers();
	});
});

describe("createHttpsServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create server with provided TLS when env has no CA_URL", async () => {
		const routes = jest.fn();
		const onServerReady = jest.fn();
		const tls = { key: "/key.pem", cert: "/cert.pem", ca: "/ca.pem" };

		const result = await createHttpsServer({
			port: 443,
			tls,
			routes,
			onServerReady,
		} as any);

		expect(MOCK_CONFIGURE_APP).toHaveBeenCalledWith({
			rateLimit: undefined,
			trustProxy: undefined,
		});
		expect(MOCK_APP.use).toHaveBeenCalledWith(MOCK_MTLS_AUTH_MIDDLEWARE);
		expect(MOCK_APP.use).toHaveBeenCalledWith(MOCK_RESPONSE_PROTOCOL);
		expect(routes).toHaveBeenCalledWith(MOCK_APP);
		expect(MOCK_CREATE_AND_START_HTTPS_SERVER).toHaveBeenCalledWith(MOCK_APP, {
			port: 443,
			tls,
			watchTls: true,
		});
		expect(onServerReady).toHaveBeenCalledWith(MOCK_HTTPS_SERVER.raw);
		expect(MOCK_CERTIFICATE_CLIENT).not.toHaveBeenCalled();
		expect(result).toBe(MOCK_HTTPS_SERVER);
	});

	it("should bootstrap TLS from env and set up auto-renew CertificateClient", async () => {
		jest.useFakeTimers();
		mockResolved(fs.access, undefined);
		const routes = jest.fn();
		const tls = {
			key: "/fallback.pem",
			cert: "/fallback.pem",
			ca: "/fallback.pem",
		};

		const result = await createHttpsServer({
			port: 8443,
			tls,
			routes,
			env: { CERT_CLIENT_CA_URL: "https://ca:8447" },
		} as any);

		expect(fs.access).toHaveBeenCalled();
		expect(MOCK_CREATE_AND_START_HTTPS_SERVER).toHaveBeenCalledWith(MOCK_APP, {
			port: 8443,
			tls: {
				keyPath: "/etc/tls/key.pem",
				certPath: "/etc/tls/cert.pem",
				caPath: "/etc/tls/ca.pem",
			},
			watchTls: true,
		});

		expect(MOCK_CERTIFICATE_CLIENT).toHaveBeenCalledTimes(1);
		const configArg = (MOCK_CERTIFICATE_CLIENT as any).mock.calls[0][0] as any;
		expect(configArg.caUrl).toBe("https://ca:8447");
		expect(typeof configArg.onRenew).toBe("function");
		expect(result).toBe(MOCK_HTTPS_SERVER);
		jest.useRealTimers();
	});

	it("onRenew should call server.raw.setSecureContext", async () => {
		jest.useFakeTimers();
		mockResolved(fs.access, undefined);
		const routes = jest.fn();

		await createHttpsServer({
			port: 8443,
			tls: { key: "/k.pem", cert: "/c.pem", ca: "/ca.pem" },
			routes,
			env: { CERT_CLIENT_CA_URL: "https://ca:8447" },
		} as any);

		const { onRenew } = (MOCK_CERTIFICATE_CLIENT as any).mock
			.calls[0][0] as any;
		onRenew({ keyPem: "key", certPem: "cert", caPem: "ca" });

		expect(MOCK_HTTPS_SERVER.raw.setSecureContext).toHaveBeenCalledWith({
			key: "key",
			cert: "cert",
			ca: "ca",
		});
		jest.useRealTimers();
	});

	it("should schedule startAutoRenew via setTimeout when env config present", async () => {
		jest.useFakeTimers();
		mockResolved(fs.access, undefined);
		const routes = jest.fn();

		await createHttpsServer({
			port: 8443,
			tls: { key: "/k.pem", cert: "/c.pem", ca: "/ca.pem" },
			routes,
			env: { CERT_CLIENT_CA_URL: "https://ca:8447" },
		} as any);

		expect(MOCK_HOLDER.startAutoRenew).not.toHaveBeenCalled();

		jest.advanceTimersByTime(1000);
		expect(MOCK_HOLDER.startAutoRenew).toHaveBeenCalledTimes(1);

		jest.useRealTimers();
	});

	it("should pass watchTls false and trustProxy true when specified", async () => {
		const routes = jest.fn();
		const tls = { key: "/k.pem", cert: "/c.pem", ca: "/ca.pem" };

		await createHttpsServer({
			port: 443,
			tls,
			routes,
			watchTls: false,
			trustProxy: true,
		} as any);

		expect(MOCK_CONFIGURE_APP).toHaveBeenCalledWith({
			rateLimit: undefined,
			trustProxy: true,
		});
		expect(MOCK_CREATE_AND_START_HTTPS_SERVER).toHaveBeenCalledWith(MOCK_APP, {
			port: 443,
			tls,
			watchTls: false,
		});
	});
});
