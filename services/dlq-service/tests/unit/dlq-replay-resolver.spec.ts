import { describe, expect, it, jest } from "@jest/globals";

const MOCK_RESOLVE_MESSAGE_MANAGER_URL = jest.fn();

jest.mock("../../src/dlq/shared/message-manager-resolver", () => ({
	resolveMessageManagerUrl: MOCK_RESOLVE_MESSAGE_MANAGER_URL,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: unknown, status: number) => ({ data, status }),
}));

describe("dlq-replay-resolver", () => {
	const mockSpan = {
		setStatus: jest.fn(),
		end: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return URL when resolution succeeds", async () => {
		MOCK_RESOLVE_MESSAGE_MANAGER_URL.mockResolvedValue("https://mm:3000");

		const { resolveMMUrlOrFail } = jest.requireActual(
			"../../src/infrastructure/dlq-replay-resolver"
		) as { resolveMMUrlOrFail: (span: typeof mockSpan) => Promise<unknown> };

		const result = await resolveMMUrlOrFail(mockSpan as never);

		expect(result).toBe("https://mm:3000");
		expect(mockSpan.setStatus).not.toHaveBeenCalled();
	});

	it("should return null and set span error when resolution fails", async () => {
		MOCK_RESOLVE_MESSAGE_MANAGER_URL.mockResolvedValue(null);

		const { resolveMMUrlOrFail } = jest.requireActual(
			"../../src/infrastructure/dlq-replay-resolver"
		) as { resolveMMUrlOrFail: (span: typeof mockSpan) => Promise<unknown> };

		const result = await resolveMMUrlOrFail(mockSpan as never);

		expect(result).toBeNull();
		expect(mockSpan.setStatus).toHaveBeenCalledWith({
			code: 2,
			message: "Cannot resolve message-manager URL",
		});
		expect(mockSpan.end).toHaveBeenCalled();
	});

	it("should return error response from mmResolveError", () => {
		const { mmResolveError } = jest.requireActual(
			"../../src/infrastructure/dlq-replay-resolver"
		) as { mmResolveError: () => { data: unknown; status: number } };

		const result = mmResolveError();

		expect(result.status).toBe(500);
	});
});
