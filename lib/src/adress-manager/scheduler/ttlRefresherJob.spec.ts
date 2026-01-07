import { TtlRefresherJob } from "./ttlRefresherJob";
import { AddressManagerClient } from "../client/addressManagerClient";

describe("TtlRefresherJob", () => {
  let mockClient: jest.Mocked<AddressManagerClient>;

  beforeEach(() => {
    // Création d'un mock complet de AddressManagerClient
    mockClient = {
      refreshTTL: jest.fn(),
    } as unknown as jest.Mocked<AddressManagerClient>;
  });

  // -----------------------------------------------------------
  // CONSTRUCTOR & SCHEDULE
  // -----------------------------------------------------------
  test("should set schedule correctly for given refresh interval", () => {
    const refreshIntervalMs = 5 * 60_000; // 5 minutes
    const job = new TtlRefresherJob(mockClient, refreshIntervalMs);

    // La conversion intervalMs -> cron doit donner */5 * * * *
    expect(job.schedule).toBe("*/5 * * * *");
  });

  test("should enforce minimum 1 minute for intervals < 1 minute", () => {
    const job = new TtlRefresherJob(mockClient, 30_000); // 30 sec
    expect(job.schedule).toBe("*/1 * * * *"); // minimum 1 minute
  });

  // -----------------------------------------------------------
  // EXECUTE METHOD
  // -----------------------------------------------------------
  test("execute should call refreshTTL on AddressManagerClient", async () => {
    const job = new TtlRefresherJob(mockClient, 60_000);
    
    await job.execute();

    expect(mockClient.refreshTTL).toHaveBeenCalledTimes(1);
  });

  test("execute should propagate errors from AddressManagerClient", async () => {
    const job = new TtlRefresherJob(mockClient, 60_000);
    const error = new Error("Refresh failed");

    mockClient.refreshTTL.mockRejectedValueOnce(error);

    await expect(job.execute()).rejects.toThrow("Refresh failed");
  });

  // -----------------------------------------------------------
  // PRIVATE intervalMsToCron METHOD
  // -----------------------------------------------------------
  // On peut tester indirectement via le constructeur
  test("intervalMsToCron generates correct cron for multiple intervals", () => {
    const intervals = [
      { ms: 60_000, expected: "*/1 * * * *" },
      { ms: 5 * 60_000, expected: "*/5 * * * *" },
      { ms: 120_000, expected: "*/2 * * * *" },
      { ms: 5000, expected: "*/1 * * * *" }, // < 1 min
    ];

    intervals.forEach(({ ms, expected }) => {
      const job = new TtlRefresherJob(mockClient, ms);
      expect(job.schedule).toBe(expected);
    });
  });
});
