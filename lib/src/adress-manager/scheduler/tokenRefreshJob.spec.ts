import { TokenRefresherJob } from "./tokenRefreshJob";
import { TokenManager } from "../client/tokenManager";

describe("TokenRefresherJob", () => {
  let mockTokenManager: jest.Mocked<TokenManager>;

  beforeEach(() => {
    mockTokenManager = {
      refreshToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TokenManager>;
  });

  // -----------------------------------------------------------
  // CONSTRUCTOR / SCHEDULE
  // -----------------------------------------------------------
  test("should create a job and generate correct cron expression for normal interval", () => {
    const job = new TokenRefresherJob(mockTokenManager, 5 * 60_000); // 5 minutes
    expect(job.schedule).toBe("*/5 * * * *");
  });

  test("should generate minimum cron expression for interval < 1 minute", () => {
    const job = new TokenRefresherJob(mockTokenManager, 10_000); // 10 seconds
    expect(job.schedule).toBe("*/1 * * * *"); // minimum 1 minute
  });

  test("should generate cron expression rounding down fractional minutes", () => {
    const job = new TokenRefresherJob(mockTokenManager, 125_000); // 2 min 5 sec
    expect(job.schedule).toBe("*/2 * * * *");
  });

  // -----------------------------------------------------------
  // EXECUTE
  // -----------------------------------------------------------
  test("execute should call tokenManager.refreshToken once", async () => {
    const job = new TokenRefresherJob(mockTokenManager, 5 * 60_000);
    await job.execute();
    expect(mockTokenManager.refreshToken).toHaveBeenCalledTimes(1);
  });

  test("execute should propagate errors from tokenManager.refreshToken", async () => {
    const job = new TokenRefresherJob(mockTokenManager, 5 * 60_000);
    mockTokenManager.refreshToken.mockRejectedValueOnce(new Error("fail"));

    await expect(job.execute()).rejects.toThrow("fail");
  });

  // -----------------------------------------------------------
  // EDGE CASES
  // -----------------------------------------------------------
  test("should handle very large intervals", () => {
    const intervalMs = 120 * 60_000; // 120 minutes
    const job = new TokenRefresherJob(mockTokenManager, intervalMs);
    expect(job.schedule).toBe("*/120 * * * *");
  });
});