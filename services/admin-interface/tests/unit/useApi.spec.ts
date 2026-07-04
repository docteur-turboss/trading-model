import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApi } from "../../src/hooks/use-api";

describe("useApi", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should start with loading true and data null", () => {
		const fetcher = vi.fn().mockResolvedValue("data");
		const { result } = renderHook(() => useApi(fetcher));

		expect(result.current.loading).toBe(true);
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});

	it("should return data on successful fetch", async () => {
		const fetcher = vi.fn().mockResolvedValue("test-data");
		const { result } = renderHook(() => useApi(fetcher));

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data).toBe("test-data");
		expect(result.current.error).toBeNull();
	});

	it("should return error on failed fetch", async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));
		const { result } = renderHook(() => useApi(fetcher));

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data).toBeNull();
		expect(result.current.error).toContain("Network error");
	});

	it("should refetch when refetch is called", async () => {
		const fetcher = vi.fn().mockResolvedValue("initial");
		const { result } = renderHook(() => useApi(fetcher));

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.data).toBe("initial"));

		fetcher.mockResolvedValue("updated");
		result.current.refetch();

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.data).toBe("updated"));
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("should not update state after unmount", async () => {
		const fetcher = vi.fn().mockResolvedValue("data");
		const { result, unmount } = renderHook(() => useApi(fetcher));

		unmount();
		await vi.advanceTimersToNextTimerAsync();

		expect(result.current.data).toBeNull();
	});

	it("should re-fetch when deps change", async () => {
		const fetcher = vi.fn().mockResolvedValue("data");
		const { result, rerender } = renderHook(
			({ id }) => useApi(() => fetcher(id), [id]),
			{
				initialProps: { id: "1" },
			}
		);

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetcher).toHaveBeenCalledWith("1");

		rerender({ id: "2" });
		expect(result.current.loading).toBe(true);

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(fetcher).toHaveBeenCalledWith("2");
	});

	it("should handle ApiError with status code", async () => {
		const { ApiError } = await import("../../src/types/dtos");
		const fetcher = vi.fn().mockRejectedValue(new ApiError(403, "Forbidden"));
		const { result } = renderHook(() => useApi(fetcher));

		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.error).toBe("Error 403: Forbidden");
	});

	it("should succeed after retry when refetch is called after error", async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error("First fail"))
			.mockResolvedValueOnce("success");

		const { result } = renderHook(() => useApi(fetcher));
		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.error).toBe("First fail"));

		result.current.refetch();
		await vi.advanceTimersToNextTimerAsync();
		await waitFor(() => expect(result.current.data).toBe("success"));
		expect(result.current.error).toBeNull();
	});
});
