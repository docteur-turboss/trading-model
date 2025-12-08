import { ServicesQueryController } from "./ServicesQuery.controller";

// --- Mock catchSync ---
jest.mock("cash-lib/middleware/catchError", () => ({
    catchSync: (fn: any) => fn
}));

// --- Mock ResponseException ---
jest.mock("cash-lib/middleware/responseException", () => ({
    ResponseException: jest.fn((body: any) => ({
        BadRequest: () => ({ type: "BadRequest", ...body }),
        OK: () => ({ type: "OK", ...body }),
    })),
}));

describe("ServicesQueryController.handle", () => {
    let registry: any;
    let leaseManager: any;
    let controller: ServicesQueryController;
    let req: any;
    let res: any;
    let next: any;

    const inst = (id: string, overrides = {}) => ({
        instanceId: id,
        serviceName: "svc",
        metadata: {},
        ...overrides
    });

    beforeEach(() => {
        registry = {
            getInstances: jest.fn()
        };

        leaseManager = {
            isAlive: jest.fn()
        };

        controller = new ServicesQueryController(registry, leaseManager);

        req = { body: {} };
        res = {};
        next = () => {};
    });

    const exec = async () => controller.handle(req, res, next);

    // ---------------------------------------------------------------------
    test("❌ Missing serviceName and services[] → BadRequest", async () => {
        req.body = {};

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
            error: "You must provide serviceName or services[]"
        });
    });

    // ---------------------------------------------------------------------
    test("🎯 Single service, onlyAlive filtering", async () => {
        req.body = { serviceName: "users" };

        const alive = inst("1");
        registry.getInstances.mockReturnValue([alive]);
        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            status: "ok",
            services: {
                users: [alive]
            }
        });

        expect(registry.getInstances).toHaveBeenCalledWith("users");
        expect(leaseManager.isAlive).toHaveBeenCalledWith(alive);
    });

    // ---------------------------------------------------------------------
    test("🧟 Dead instance excluded when onlyAlive=true", async () => {
        req.body = { serviceName: "api", onlyAlive: true };

        const dead = inst("42");
        registry.getInstances.mockReturnValue([dead]);
        leaseManager.isAlive.mockReturnValue(false);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            services: {
                api: []   // filtré car pas vivant
            }
        });
    });

    // ---------------------------------------------------------------------
    test("🟢 onlyAlive=false keeps all instances", async () => {
        req.body = { serviceName: "auth", onlyAlive: false };

        const any = inst("x");
        registry.getInstances.mockReturnValue([any]);

        // Même si isAlive = false → garde l'instance
        leaseManager.isAlive.mockReturnValue(false);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            services: {
                auth: [any]
            }
        });
    });

    // ---------------------------------------------------------------------
    test("🗃️ Multi-service query returns each service independently", async () => {
        req.body = { services: ["a", "b"] };

        const a1 = inst("a1");
        const b1 = inst("b1");

        /* eslint-disable  @typescript-eslint/no-explicit-any */
        registry.getInstances.mockImplementation((name:any) => {
            if (name === "a") return [a1];
            if (name === "b") return [b1];
            return [];
        });

        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            services: {
                a: [a1],
                b: [b1]
            }
        });
    });

    // ---------------------------------------------------------------------
    test("🔎 Metadata filtering keeps only matching instances", async () => {
        req.body = {
            serviceName: "svc",
            metadata: { version: "1.0" }
        };

        const inst1 = inst("1", { metadata: { version: "1.0" } });
        const inst2 = inst("2", { metadata: { version: "2.0" } });

        registry.getInstances.mockReturnValue([inst1, inst2]);
        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            services: {
                svc: [inst1]  // seulement version 1.0
            }
        });
    });

    // ---------------------------------------------------------------------
    test("🔎 Metadata filtering with multiple fields", async () => {
        req.body = {
            serviceName: "backend",
            metadata: { version: "1.0", env: "prod" }
        };

        const good = inst("g", { metadata: { version: "1.0", env: "prod" } });
        const wrongVersion = inst("v", { metadata: { version: "2.0", env: "prod" } });
        const wrongEnv = inst("e", { metadata: { version: "1.0", env: "dev" } });

        registry.getInstances.mockReturnValue([good, wrongVersion, wrongEnv]);
        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            type: "OK",
            services: {
                backend: [good]
            }
        });
    });
});