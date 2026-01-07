import https from "https";
import { HttpClient, HttpClientError, HttpClientTimeoutError } from "./httpClient";

/* eslint-disable */

jest.mock("https");

describe("HttpClient", () => {
  let client: HttpClient;
  const requestMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (https.request as unknown as jest.Mock) = requestMock;
    client = new HttpClient({ ca: "ca", cert: "cert", key: "key" });
  });

  const mockResponse = (statusCode: number, data?: any, headers?: Record<string, string>) => {
    return {
      on: jest.fn((event, cb) => {
        if (event === "data" && data) cb(JSON.stringify(data));
        if (event === "end") cb();
        return mockResponse;
      }),
      headers: headers || { "content-type": "application/json" },
      statusCode,
    };
  };

  const mockReq = () => {
    return {
      on: jest.fn(),
      setTimeout: jest.fn((timeout, cb) => {}),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };
  };

  test("GET should return parsed JSON", async () => {
    const res = mockResponse(200, { ok: true });
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => {
      cb(res as any);
      return req;
    });

    const result = await client.get<{ ok: boolean }>("https://example.com/test");
    expect(result).toEqual({ ok: true });
    expect(req.end).toHaveBeenCalled();
  });

  test("POST should send body and return JSON", async () => {
    const res = mockResponse(201, { created: true });
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => {
      cb(res as any);
      return req;
    });

    const body = { name: "test" };
    const result = await client.post<{ created: boolean }>("https://example.com/test", body);
    expect(result).toEqual({ created: true });
    expect(req.write).toHaveBeenCalledWith(JSON.stringify(body));
    expect(req.end).toHaveBeenCalled();
  });

  test("should reject on HTTP error status", async () => {
    const res = mockResponse(500, { error: "Server error" });
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => {
      cb(res as any);
      return req;
    });

    await expect(client.get("https://example.com/error")).rejects.toThrow(HttpClientError);
  });

  test("should reject on network error", async () => {
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => req);
    const networkError = new Error("Network fail");
    (req.on as jest.Mock).mockImplementation((event, cb) => {
      if (event === "error") cb(networkError);
    });

    await expect(client.get("https://example.com/fail")).rejects.toThrow("Network fail");
  });

  test("should reject on timeout", async () => {
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => req);
    let timeoutCallback: () => void;
    (req.setTimeout as jest.Mock).mockImplementation((ms, cb) => {
      timeoutCallback = cb;
    });

    const promise = client.get("https://example.com/timeout", { timeoutMs: 50 });
    timeoutCallback!();
    await expect(promise).rejects.toThrow(HttpClientTimeoutError);
  });

  test("should handle non-JSON responses", async () => {
    const res = mockResponse(200, "plain text", { "content-type": "text/plain" });
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => {
      cb(res as any);
      return req;
    });

    const result = await client.get<string>("https://example.com/text");
    expect(result).toEqual("\"plain text\"");
  });

  test("should return undefined on 204 No Content", async () => {
    const res = mockResponse(204);
    const req = mockReq();
    requestMock.mockImplementation((options, cb) => {
      cb(res as any);
      return req;
    });

    const result = await client.get("https://example.com/nocontent");
    expect(result).toBeUndefined();
  });
});