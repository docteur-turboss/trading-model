import { Request } from "express";
import { MTLSAuthMiddleware } from "../../common/middleware/MTLSAuth";

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

jest.mock("./catchError", () => ({
  catchSync: (fn: unknown) => fn,
}));

jest.mock("./responseException", () => ({
  ResponseException: jest.fn((body: string) => ({
    Forbidden: () => ({ type: "Forbidden", ...JSON.parse(body) }),
    Unauthorized: () => ({ type: "Unauthorized", ...JSON.parse(body) }),
  })),
}));

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const createReq = (socketOverrides: Partial<unknown> = {}) => ({
  socket: {
    authorized: true,
    authorizationError: null,
    getPeerCertificate: jest.fn(),
    ...socketOverrides,
  },
});

const createRes = () => ({});
const createNext = () => jest.fn();

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("MTLSAuthMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  test("❌ TLS socket not authorized → Forbidden", async () => {
    const req = createReq({
      authorized: false,
      authorizationError: "CERT_HAS_EXPIRED",
    });
    const res = createRes();
    const next = createNext();

    await expect(
      /* eslint-disable-next-line */
      MTLSAuthMiddleware(req, res, next)
    ).rejects.toMatchObject({
      type: "Forbidden",
      error: "mTLS authorization failed",
      reason: "CERT_HAS_EXPIRED",
    });

    expect(next).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  test("❌ No client certificate provided → Unauthorized", async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    req.socket.getPeerCertificate.mockReturnValue({});

    await expect(
      MTLSAuthMiddleware(req as any, res as any, next)
    ).rejects.toMatchObject({
      type: "Unauthorized",
      error: "Client certificate required",
    });

    expect(next).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  test("✅ Extract identity from SAN (subjectaltname)", async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    req.socket.getPeerCertificate.mockReturnValue({
      subjectaltname: "DNS:service-a.internal",
      subject: { CN: "fallback-cn" },
    });

    await MTLSAuthMiddleware(req as any, res as any, next);

    expect((req as any).clientIdentity).toBe("DNS:service-a.internal");
    expect(next).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  test("✅ Fallback to CN when SAN is missing", async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    req.socket.getPeerCertificate.mockReturnValue({
      subject: { CN: "service-b" },
    });

    await MTLSAuthMiddleware(req as any, res as any, next);

    expect((req as any).clientIdentity).toBe("service-b");
    expect(next).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  test("✅ Identity defaults to 'unknown' if SAN and CN are missing", async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    req.socket.getPeerCertificate.mockReturnValue({
      subject: {},
    });

    await MTLSAuthMiddleware(req as any, res as any, next);

    expect((req as any).clientIdentity).toBe("unknown");
    expect(next).toHaveBeenCalledTimes(1);
  });
});