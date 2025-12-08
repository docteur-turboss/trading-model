import { HeartbeatController } from "./Heartbeat.controller";
import { ResponseException } from "cash-lib/middleware/responseException";
import { ServiceRegistry } from "../core/ServiceRegistry";

// Mock du catchSync → exécute simplement la fn donnée
jest.mock("cash-lib/middleware/catchError", () => ({
    catchSync: (fn: any) => fn,
}));

// Stub ResponseException pour capturer le type d'erreur
jest.mock("cash-lib/middleware/responseException", () => {
    return {
        ResponseException: jest.fn((value: any) => ({
            BadRequest: () => ({ type: "BadRequest", ...value }),
            Unauthorized: () => ({ type: "Unauthorized", ...value }),
            UnknownError: () => ({ type: "UnknownError", ...value }),
            Success: () => ({ type: "Success", ...value }),
        })),
    };
});

describe("HeartbeatController.handle", () => {
    let registry: jest.Mocked<ServiceRegistry>;
    let controller: HeartbeatController;
    let req: any;
    let res: any;
    let next: any;

    beforeEach(() => {
        registry = {
            verifyInstanceName: jest.fn(),
            getInstance: jest.fn(),
            validInstanceToken: jest.fn(),
            generateInstanceToken: jest.fn(),
            updateHeartbeat: jest.fn(),
        } as any;

        controller = new HeartbeatController(registry);

        req = { body: {} };
        res = {};
        next = () => {};
    });

    const exec = async () => controller.handle(req, res, next);

    // --------------------------------------------------------
    test("❌ Missing serviceName or instanceId → BadRequest", async () => {
        req.body = { serviceName: "test" }; // Missing instanceId

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
        });
    });

    test("❌ verifyInstanceName retourne false → BadRequest", async () => {
        req.body = { serviceName: "svc", instanceId: "1", authToken: "abc" };

        registry.verifyInstanceName.mockReturnValue(false);
        registry.getInstance.mockReturnValue({ instanceId: "1", ip: "", lastHeartbeat: 1, port: 2, protocol: "http", registeredAt: 12335, serviceName: "21", ttl: 10000 });

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
            error: "Invalid serviceName",
        });
    });

    test("❌ instance introuvable → BadRequest", async () => {
        req.body = { serviceName: "svc", instanceId: "1", authToken: "abc" };

        registry.verifyInstanceName.mockReturnValue(true);
        registry.getInstance.mockReturnValue(undefined);

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
            error: "Invalid serviceName",
        });
    });

    test("❌ Token invalide → Unauthorized", async () => {
        req.body = { serviceName: "svc", instanceId: "1", authToken: "wrong" };

        registry.verifyInstanceName.mockReturnValue(true);
        registry.getInstance.mockReturnValue({ instanceId: "1", ip: "", lastHeartbeat: 1, port: 2, protocol: "http", registeredAt: 12335, serviceName: "21", ttl: 10000 });
        registry.validInstanceToken.mockReturnValue(false);

        await expect(exec()).rejects.toMatchObject({
            type: "Unauthorized",
            error: "Missing or invalid authToken",
        });
    });

    test("❌ updateHeartbeat retourne 0/false → UnknownError", async () => {
        req.body = { serviceName: "svc", instanceId: "1", authToken: "valid" };

        registry.verifyInstanceName.mockReturnValue(true);
        registry.getInstance.mockReturnValue({ instanceId: "1", ip: "", lastHeartbeat: 1, port: 2, protocol: "http", registeredAt: 12335, serviceName: "21", ttl: 10000 });
        registry.validInstanceToken.mockReturnValue(true);
        registry.generateInstanceToken.mockReturnValue("new-token");
        registry.updateHeartbeat.mockReturnValue(0);

        await expect(exec()).rejects.toMatchObject({
            type: "UnknownError",
            error: "Failed to refresh lease",
        });
    });

    test("✅ Succès complet → Success()", async () => {
        req.body = { serviceName: "svc", instanceId: "1", authToken: "valid" };

        registry.verifyInstanceName.mockReturnValue(true);
        registry.getInstance.mockReturnValue({ instanceId: "1", ip: "", lastHeartbeat: 1, port: 2, protocol: "http", registeredAt: 12335, serviceName: "21", ttl: 10000 });
        registry.validInstanceToken.mockReturnValue(true);
        registry.generateInstanceToken.mockReturnValue("new-token");
        registry.updateHeartbeat.mockReturnValue(60);

        await expect(exec()).rejects.toMatchObject({
            type: "Success",
            status: "ok",
            token: "new-token",
            ttl: 60,
            message: "Heartbeat updated",
        });
    });
});