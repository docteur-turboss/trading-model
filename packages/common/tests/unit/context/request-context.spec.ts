import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it, jest } from "@jest/globals";
import {
	REQUEST_CONTEXT,
	requestContextMiddleware,
} from "../../../src/context/request-context";
import { HTTP_HEADERS } from "../../../src/http-headers";

describe("REQUEST_CONTEXT", () => {
	it("should be an instance of AsyncLocalStorage", () => {
		expect(REQUEST_CONTEXT).toBeInstanceOf(AsyncLocalStorage);
	});
});

describe("requestContextMiddleware", () => {
	it("should create a store with unknown defaults when no identity is present", () => {
		const req = {
			headers: {},
		};
		const next = jest.fn();

		requestContextMiddleware(req as never, undefined, next);

		expect(next).toHaveBeenCalledTimes(1);
	});

	it("should propagate clientIdentity and correlationId through REQUEST_CONTEXT", async () => {
		const req = {
			headers: {
				[HTTP_HEADERS.X_REQUEST_ID]: "req-123",
			},
			clientIdentity: "svc-trader",
			correlationId: "corr-abc",
		};
		await new Promise<void>((resolve) => {
			const next = () => {
				const store = REQUEST_CONTEXT.getStore();
				expect(store).toBeDefined();
				expect(store!.clientIdentity).toBe("svc-trader");
				expect(store!.requestId).toBe("req-123");
				expect(store!.correlationId).toBe("corr-abc");
				resolve();
			};

			requestContextMiddleware(req as never, undefined, next);
		});
	});

	it("should fallback clientIdentity to unknown when not set", async () => {
		const req = {
			headers: {},
		};
		await new Promise<void>((resolve) => {
			const next = () => {
				const store = REQUEST_CONTEXT.getStore();
				expect(store!.clientIdentity).toBe("unknown");
				resolve();
			};

			requestContextMiddleware(req as never, undefined, next);
		});
	});

	it("should prefer x-request-id header over extra correlationId for requestId", async () => {
		const req = {
			headers: {
				[HTTP_HEADERS.X_REQUEST_ID]: "from-header",
			},
			correlationId: "from-extra",
		};
		await new Promise<void>((resolve) => {
			const next = () => {
				const store = REQUEST_CONTEXT.getStore();
				expect(store!.requestId).toBe("from-header");
				resolve();
			};

			requestContextMiddleware(req as never, undefined, next);
		});
	});

	it("should fallback requestId to extra correlationId when x-request-id is absent", async () => {
		const req = {
			headers: {},
			correlationId: "corr-fallback",
		};
		await new Promise<void>((resolve) => {
			const next = () => {
				const store = REQUEST_CONTEXT.getStore();
				expect(store!.requestId).toBe("corr-fallback");
				resolve();
			};

			requestContextMiddleware(req as never, undefined, next);
		});
	});

	it("should fallback requestId to unknown when nothing is available", async () => {
		const req = {
			headers: {},
		};
		await new Promise<void>((resolve) => {
			const next = () => {
				const store = REQUEST_CONTEXT.getStore();
				expect(store!.requestId).toBe("unknown");
				resolve();
			};

			requestContextMiddleware(req as never, undefined, next);
		});
	});

	it("should store different values for nested runs", async () => {
		const req1 = {
			headers: { [HTTP_HEADERS.X_REQUEST_ID]: "req-1" },
			clientIdentity: "svc-a",
			correlationId: "corr-1",
		};
		const req2 = {
			headers: { [HTTP_HEADERS.X_REQUEST_ID]: "req-2" },
			clientIdentity: "svc-b",
			correlationId: "corr-2",
		};

		await new Promise<void>((resolve) => {
			REQUEST_CONTEXT.run({} as never, () => {
				requestContextMiddleware(req1 as never, undefined, () => {
					const store1 = REQUEST_CONTEXT.getStore();
					expect(store1!.requestId).toBe("req-1");
					expect(store1!.clientIdentity).toBe("svc-a");

					requestContextMiddleware(req2 as never, undefined, () => {
						const store2 = REQUEST_CONTEXT.getStore();
						expect(store2!.requestId).toBe("req-2");
						expect(store2!.clientIdentity).toBe("svc-b");
						resolve();
					});
				});
			});
		});
	});
});
