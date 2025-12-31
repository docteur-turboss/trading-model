 /* eslint-disable */
import { heartbeat, rotateToken } from "./Heartbeat.controller";
import { createReq, createRes } from "../tests/helpers/express";

import { registry } from "../core/ServiceRegistry";

// -----------------------------------------------------------------------------
// HEARTBEAT
// -----------------------------------------------------------------------------

describe("heartbeat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("❌ Body is not an object → BadRequest", async () => {
    const req = createReq({ body: "invalid" });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "Invalid request body",
    });
  });

  test("❌ Missing serviceName → BadRequest", async () => {
    const req = createReq({
      body: { instanceId: "i1" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "serviceName is required",
    });
  });

  test("❌ Missing instanceId → BadRequest", async () => {
    const req = createReq({
      body: { serviceName: "svc" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "instanceId is required",
    });
  });

  test("❌ Missing token header → Unauthorized", async () => {
    const req = createReq({
      body: { serviceName: "svc", instanceId: "i1" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Unauthorized",
      error: "Missing or invalid instance token",
    });
  });

  test("❌ Invalid instance token → Unauthorized", async () => {
    (registry.validInstanceToken as jest.Mock).mockReturnValue(false);

    const req = createReq({
      body: { serviceName: "svc", instanceId: "i1" },
      headers: { "x-instance-token": "bad" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Unauthorized",
      error: "Invalid instance token",
    });
  });

  test("❌ Instance not found → NotFound", async () => {
    (registry.validInstanceToken as jest.Mock).mockReturnValue(true);
    (registry.updateHeartbeat as jest.Mock).mockReturnValue(null);

    const req = createReq({
      body: { serviceName: "svc", instanceId: "i1" },
      headers: { "x-instance-token": "ok" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "NotFound",
      error: "Instance not found",
    });
  });

  test("✅ Heartbeat success → Success with TTL", async () => {
    (registry.validInstanceToken as jest.Mock).mockReturnValue(true);
    (registry.updateHeartbeat as jest.Mock).mockReturnValue(15000);

    const req = createReq({
      body: { serviceName: "svc", instanceId: "i1" },
      headers: { "x-instance-token": "ok" },
    });

    await expect(
      heartbeat(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Success",
      ttl: 15000,
    });
  });
});

// -----------------------------------------------------------------------------
// ROTATE TOKEN
// -----------------------------------------------------------------------------

describe("rotateToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("❌ Body is not an object → BadRequest", async () => {
    const req = createReq({ body: null });

    await expect(
      rotateToken(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "Invalid request body",
    });
  });

  test("❌ Missing instanceId → BadRequest", async () => {
    const req = createReq({ body: {} });

    await expect(
      rotateToken(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "BadRequest",
      error: "instanceId is required",
    });
  });

  test("❌ Missing token header → Unauthorized", async () => {
    const req = createReq({
      body: { instanceId: "i1" },
    });

    await expect(
      rotateToken(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Unauthorized",
      error: "Missing or invalid instance token",
    });
  });

  test("❌ Invalid instance token → Unauthorized", async () => {
    (registry.validInstanceToken as jest.Mock).mockReturnValue(false);

    const req = createReq({
      body: { instanceId: "i1" },
      headers: { "x-instance-token": "bad" },
    });

    await expect(
      rotateToken(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Unauthorized",
      error: "Invalid instance token",
    });
  });

  test("✅ Token rotation success → Success with new token", async () => {
    (registry.validInstanceToken as jest.Mock).mockReturnValue(true);
    (registry.updateToken as jest.Mock).mockReturnValue("new-token");

    const req = createReq({
      body: { instanceId: "i1" },
      headers: { "x-instance-token": "old-token" },
    });

    await expect(
      rotateToken(req as any, createRes(), jest.fn())
    ).rejects.toMatchObject({
      type: "Success",
      token: "new-token",
    });
  });
});