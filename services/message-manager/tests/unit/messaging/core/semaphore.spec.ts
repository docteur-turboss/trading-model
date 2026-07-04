import { describe, expect, it } from "@jest/globals";
import { Semaphore } from "../../../../src/messaging/core/semaphore";

describe("Semaphore", () => {
	it("should acquire immediately when below max", async () => {
		const sem = new Semaphore(2);
		await sem.acquire();
		expect(sem.running).toBe(1);
	});

	it("should block when at max capacity", async () => {
		const sem = new Semaphore(1);
		await sem.acquire();
		let acquired2 = false;
		const p = sem.acquire().then(() => {
			acquired2 = true;
		});
		expect(acquired2).toBe(false);
		sem.release();
		await p;
		expect(acquired2).toBe(true);
	});

	it("should throw when queue exceeds maxQueue", async () => {
		const sem = new Semaphore(1, 0);
		await sem.acquire();
		try {
			await sem.acquire();
			expect(true).toBe(false);
		} catch (err) {
			expect((err as Error).message).toContain("Semaphore queue full");
		}
	});

	it("should release and hand off to next waiter", async () => {
		const sem = new Semaphore(1);
		await sem.acquire();
		let released = false;
		const p = sem.acquire().then(() => {
			released = true;
		});
		sem.release();
		await p;
		expect(released).toBe(true);
	});

	it("should report waiting count", async () => {
		const sem = new Semaphore(1);
		await sem.acquire();
		const p1 = sem.acquire();
		const p2 = sem.acquire();
		expect(sem.waiting).toBe(2);
		sem.release();
		sem.release();
		await Promise.all([p1, p2]);
	});

	it("should run a function within the semaphore", async () => {
		const sem = new Semaphore(1);
		const result = await sem.run(async () => "done");
		expect(result).toBe("done");
	});

	it("should release after run even on error", async () => {
		const sem = new Semaphore(2);
		await expect(
			sem.run(async () => {
				throw new Error("fail");
			})
		).rejects.toThrow("fail");
		await sem.acquire();
		sem.release();
	});
});
