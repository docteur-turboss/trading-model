import {
  register,
  listServices,
  getServiceInstances,
  getInstance,
  dump,
} from "./Register.controller";

import { registry } from "../core/ServiceRegistry";
import { createReq, createRes, createNext } from "../tests/helpers/express";

// -----------------------------------------------------------------------------
// REGISTER
// -----------------------------------------------------------------------------

describe("register", () => {
  beforeEach(() => jest.clearAllMocks());

  test("❌ Invalid body → BadRequest", async () => {
    await expect(
      register(createReq({ body: null }) as any, createRes(), createNext)
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "Invalid request body",
    });
  });

  test("❌ Invalid service name → BadRequest", async () => {
    (registry.verifyInstanceName as jest.Mock).mockReturnValue(false);

    await expect(
      register(
        createReq({ body: { serviceName: "bad", ip: "1.1.1.1", port: 80 } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "Invalid service name",
    });
  });

  test("❌ Invalid IP → BadRequest", async () => {
    (registry.verifyInstanceName as jest.Mock).mockReturnValue(true);

    await expect(
      register(
        createReq({ body: { serviceName: "svc", ip: null, port: 80 } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "Invalid IP address",
    });
  });

  test("✅ Generate instanceId if missing and register", async () => {
    (registry.verifyInstanceName as jest.Mock).mockReturnValue(true);
    (registry.generateInstanceId as jest.Mock).mockReturnValue("gen-id");
    (registry.registerInstance as jest.Mock).mockReturnValue({ instanceId: "gen-id" });

    await expect(
      register(
        createReq({
          body: { serviceName: "svc", ip: "127.0.0.1", port: 3000 },
        }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "OK",
      instanceId: "gen-id",
    });

    expect(registry.generateInstanceId).toHaveBeenCalledWith(
      "svc",
      "127.0.0.1",
      3000
    );
  });
});

// -----------------------------------------------------------------------------
// LIST SERVICES
// -----------------------------------------------------------------------------

describe("listServices", () => {
  test("✅ Returns service names", async () => {
    (registry.listServiceNames as jest.Mock).mockReturnValue(["a", "b"]);

    await expect(
      listServices(createReq() as any, createRes(), createNext)
    ).rejects.toMatchObject({
      type: "Success",
      0: "a",
      1: "b",
    });
  });
});

// -----------------------------------------------------------------------------
// GET SERVICE INSTANCES
// -----------------------------------------------------------------------------

describe("getServiceInstances", () => {
  beforeEach(() => jest.clearAllMocks());

  test("❌ Missing serviceName → BadRequest", async () => {
    await expect(
      getServiceInstances(createReq({ params: {} }) as any, createRes(), createNext)
    ).rejects.toMatchObject({
      type: "BadRequest",
    });
  });

  test("❌ Unknown service → NotFound", async () => {
    (registry.verifyInstanceName as jest.Mock).mockReturnValue(false);

    await expect(
      getServiceInstances(
        createReq({ params: { serviceName: "svc" } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "NotFound",
      error: "Unknown service",
    });
  });

  test("✅ Return instances", async () => {
    (registry.verifyInstanceName as jest.Mock).mockReturnValue(true);
    (registry.getInstances as jest.Mock).mockReturnValue([{ id: "1" }]);

    await expect(
      getServiceInstances(
        createReq({ params: { serviceName: "svc" } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "Success",
      0: { id: "1" },
    });
  });
});

// -----------------------------------------------------------------------------
// GET SINGLE INSTANCE
// -----------------------------------------------------------------------------

describe("getInstance", () => {
  test("❌ Invalid params → BadRequest", async () => {
    await expect(
      getInstance(createReq({ params: { serviceName: "svc" } }) as any, createRes(), createNext)
    ).rejects.toMatchObject({
      type: "BadRequest",
    });
  });

  test("❌ Instance not found → NotFound", async () => {
    (registry.getInstance as jest.Mock).mockReturnValue(null);

    await expect(
      getInstance(
        createReq({ params: { serviceName: "svc", instanceId: "i1" } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "NotFound",
      error: "Instance not found",
    });
  });

  test("✅ Return instance", async () => {
    (registry.getInstance as jest.Mock).mockReturnValue({ instanceId: "i1" });

    await expect(
      getInstance(
        createReq({ params: { serviceName: "svc", instanceId: "i1" } }) as any,
        createRes(),
        createNext
      )
    ).rejects.toMatchObject({
      type: "Success",
      instanceId: "i1",
    });
  });
});

// -----------------------------------------------------------------------------
// DUMP
// -----------------------------------------------------------------------------

describe("dump", () => {
  test("✅ Dump registry state", async () => {
    (registry.dump as jest.Mock).mockReturnValue({ services: {} });

    await expect(
      dump(createReq() as any, createRes(), createNext)
    ).rejects.toMatchObject({
      type: "Success",
      services: {},
    });
  });
});