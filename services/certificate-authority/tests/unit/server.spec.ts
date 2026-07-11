import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/server/create-secure-server", () => ({
	createSecureServer: jest.fn(),
	buildTlsFromEnv: jest.fn(() => ({
		key: "/key.pem",
		cert: "/cert.pem",
		ca: "/ca.pem",
	})),
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		PORT: 8443,
		TLS_KEY_PATH: "/key.pem",
		TLS_CERT_PATH: "/cert.pem",
		TLS_CA_PATH: "/ca.pem",
	},
}));

jest.mock("../../src/routes/certificate.routes", () => ({
	certificateRoutes: jest.fn(),
}));

jest.mock("../../src/routes/crl.routes", () => ({
	crlRoutes: jest.fn(),
}));

jest.mock("../../src/routes/health.routes", () => ({
	healthRoutes: jest.fn(),
}));

import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { createServer } from "../../src/app/server";
import { certificateRoutes } from "../../src/routes/certificate.routes";
import { crlRoutes } from "../../src/routes/crl.routes";
import { healthRoutes } from "../../src/routes/health.routes";

describe("createServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a secure server with TLS and routes", () => {
		const mockServer = { close: jest.fn() };
		(createSecureServer as jest.Mock).mockImplementation((opts: any) => {
			const app = { use: jest.fn() };
			opts.routes(app);
			return mockServer;
		});

		const certRouter = { post: jest.fn(), get: jest.fn() };
		const crlRouter = { get: jest.fn() };
		const healthRouter = { get: jest.fn() };
		(certificateRoutes as jest.Mock).mockReturnValue(certRouter);
		(crlRoutes as jest.Mock).mockReturnValue(crlRouter);
		(healthRoutes as jest.Mock).mockReturnValue(healthRouter);

		const result = createServer();

		expect(createSecureServer).toHaveBeenCalledWith({
			port: 8443,
			tls: {
				key: "/key.pem",
				cert: "/cert.pem",
				ca: "/ca.pem",
			},
			routes: expect.any(Function),
		});
		expect(result).toBe(mockServer);
	});

	it("should register all three route groups", () => {
		const app = { use: jest.fn() };
		(createSecureServer as jest.Mock).mockImplementation((opts: any) => {
			opts.routes(app);
			return { close: jest.fn() };
		});

		const healthRouter = { get: jest.fn() };
		const certRouter = { post: jest.fn(), get: jest.fn() };
		const crlRouter = { get: jest.fn() };
		(healthRoutes as jest.Mock).mockReturnValue(healthRouter);
		(certificateRoutes as jest.Mock).mockReturnValue(certRouter);
		(crlRoutes as jest.Mock).mockReturnValue(crlRouter);

		void createServer();

		expect(app.use).toHaveBeenCalledWith("/", healthRouter);
		expect(app.use).toHaveBeenCalledWith("/api/v1/certificate", certRouter);
		expect(app.use).toHaveBeenCalledWith("/api/v1", crlRouter);
	});
});
