import { ResolveController } from "./Resolve.controller";

// Mock middleware
jest.mock("cash-lib/middleware/catchError", () => ({
    catchSync: (fn: any) => fn
}));

// Mock logger
jest.mock("cash-lib/config/logger", () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn()
    }
}));

// Mock ResponseException
jest.mock("cash-lib/middleware/responseException", () => ({
    ResponseException: jest.fn((body: any) => ({
        BadRequest: () => ({ type: "BadRequest", ...body }),
        NotFound: () => ({ type: "NotFound", ...body }),
        Gone: () => ({ type: "Gone", ...body }),
        Success: () => ({ type: "Success", ...body }),
    })),
}));

describe("ResolveController.resolve", () => {
    let registry: any;
    let leaseManager: any;
    let controller: ResolveController;
    let req: any;
    let res: any;
    let next: any;

    beforeEach(() => {
        registry = {
            getInstances: jest.fn()
        };
        leaseManager = {
            isAlive: jest.fn()
        };

        controller = new ResolveController(registry, leaseManager);

        req = {
            params: {},
            query: {}
        };
        res = {};
        next = () => {};
    });

    const exec = async () => controller.resolve(req, res, next);

    const instance = (id: string, overrides: Partial<any> = {}) => ({
        id,
        name: "svc",
        address: "127.0.0.1",
        port: 3000,
        protocol: "http",
        metadata: {},
        role: null,
        env: "dev",
        ...overrides
    });

    // --------------------------------------------------------------------
    test("❌ Path missing → BadRequest", async () => {
        req.params = {};

        await expect(exec()).rejects.toMatchObject({
            type: "BadRequest",
            error: "Missing service name in path."
        });
    });

    // --------------------------------------------------------------------
    test("❌ No instance registered → NotFound", async () => {
        req.params = { serviceName: "svc" };

        registry.getInstances.mockReturnValue([]);

        await expect(exec()).rejects.toMatchObject({
            type: "NotFound"
        });
    });

    // --------------------------------------------------------------------
    test("❌ Filters match zero results → NotFound", async () => {
        req.params = { serviceName: "svc" };
        req.query = { role: "db" };

        registry.getInstances.mockReturnValue([
            instance("1", { role: "app" })
        ]);

        await expect(exec()).rejects.toMatchObject({
            type: "NotFound"
        });
    });

    // --------------------------------------------------------------------
    test("❌ Instances not alive → Gone (TTL expired)", async () => {
        req.params = { serviceName: "svc" };

        const inst = instance("1");
        registry.getInstances.mockReturnValue([inst]);
        leaseManager.isAlive.mockReturnValue(false);

        await expect(exec()).rejects.toMatchObject({
            type: "Gone",
        });
    });

    // --------------------------------------------------------------------
    test("🎯 Success: return matching alive instance", async () => {
        req.params = { serviceName: "svc" };

        const inst = instance("1", { role: "api", env: "dev" });

        registry.getInstances.mockReturnValue([inst]);
        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            type: "Success",
            instanceId: inst.id,
            name: inst.name,
            address: inst.address,
            port: inst.port,
            protocol: inst.protocol,
            metadata: inst.metadata,
            role: inst.role,
            env: inst.env,
        });
    });

    // --------------------------------------------------------------------
    test("⚙️ Round-Robin selection over multiple instances", async () => {
        req.params = { serviceName: "svc" };

        const i1 = instance("1");
        const i2 = instance("2");
        const instances = [i1, i2];

        registry.getInstances.mockReturnValue(instances);
        leaseManager.isAlive.mockReturnValue(true);

        // 1st call → i1
        await expect(exec()).rejects.toMatchObject({
            instanceId: "1"
        });

        // 2nd call → i2
        await expect(exec()).rejects.toMatchObject({
            instanceId: "2"
        });

        // 3rd call → i1 again (loop)
        await expect(exec()).rejects.toMatchObject({
            instanceId: "1"
        });
    });

    // --------------------------------------------------------------------
    test("🎚 Filtering by version in metadata", async () => {
        req.params = { serviceName: "svc" };
        req.query = { version: "1.0" };

        const instOne = instance("1", { metadata: { version: "2.0" } });
        const instTwo = instance("2", { metadata: { version: "1.0" } });

        registry.getInstances.mockReturnValue([instOne, instTwo]);
        leaseManager.isAlive.mockReturnValue(true);

        await expect(exec()).rejects.toMatchObject({
            instanceId: "2"
        });
    });
});
