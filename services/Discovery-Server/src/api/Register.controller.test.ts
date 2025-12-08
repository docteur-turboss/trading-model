import { RegisterController } from "./Register.controller";
import { ServiceRegistry } from "../core/ServiceRegistry";

// Mock du middleware
jest.mock("cash-lib/middleware/catchError", () => ({
    catchSync: (fn: any) => fn,
}));

// Mock du logger
jest.mock("cash-lib/config/logger", () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
    }
}));

// Mock simplifié ResponseException
jest.mock("cash-lib/middleware/responseException", () => ({
    ResponseException: jest.fn((body: any) => ({
        BadRequest: () => ({ type: "BadRequest", ...body }),
        OK: () => ({ type: "OK", ...body }),
    })),
}));

describe("RegisterController.register", () => {
    let registry: jest.Mocked<ServiceRegistry>;
    let controller: RegisterController;
    let req: any;
    let res: any;
    let next: any;

    beforeEach(() => {
        registry = {
            generateInstanceId: jest.fn(),
            registerInstance: jest.fn(),
        } as any;

        controller = new RegisterController(registry);

        req = { body: {} };
        res = {};
        next = () => {};
    });

    const exec = async () => controller.register(req, res, next);

    // ----------------------------------------------------------------------
    test("❌ Missing fields → BadRequest", async () => {
        req.body = { name: "test" }; // manque address, port, protocol

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
            error: expect.stringContaining("Missing fields")
        });
    });

    // ----------------------------------------------------------------------
    test("🧹 Normalisation & appels registry OK", async () => {
        req.body = {
            name: " Service ",
            address: " 127.0.0.1 ",
            port: "3000",
            protocol: "HTTP",
            metadata: { v: 1 }
        };

        registry.generateInstanceId.mockReturnValue("id-123");
        registry.registerInstance.mockReturnValue({
            instanceId: "id-123",
            serviceName: "Service",
            ip: "127.0.0.1",
            port: 3000,
            protocol: "http",
            ttl: 20000,
            token: "tkn"
        });

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            instanceId: "id-123",
            service: "Service",
            token: "tkn",
            ttl: 20000,
        });

        expect(registry.generateInstanceId).toHaveBeenCalledWith(
            "Service", "127.0.0.1", 3000
        );

        expect(registry.registerInstance).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceName: "Service",
                ip: "127.0.0.1",
                port: 3000,
                protocol: "http",
                metadata: { v: 1 },
                lastHeartbeat: 0,
                ttl: 20000,
            })
        );
    });

    // ----------------------------------------------------------------------
    test("🌍 Utilisation de l'environnement défaut si non fourni", async () => {
        const previousEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "dev-env";

        req.body = {
            name: "A",
            address: "b",
            port: 1,
            protocol: "http"
        };

        registry.generateInstanceId.mockReturnValue("id-env");
        registry.registerInstance.mockReturnValue({
            instanceId: "id-env",
            serviceName: "A",
            ttl: 20000,
            token: "z"
        });

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            instanceId: "id-env"
        });

        expect(registry.registerInstance).toHaveBeenCalledWith(
            expect.objectContaining({
                env: "dev-env"
            })
        );

        process.env.NODE_ENV = previousEnv;
    });
});