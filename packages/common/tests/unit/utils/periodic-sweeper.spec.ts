import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { PeriodicSweeper } from "../../../src/utils/periodic-sweeper";

describe("PeriodicSweeper", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.spyOn(Math, "random").mockReturnValue(0);
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("should not be running before start", () => {
		const sweeper = new PeriodicSweeper(() => {}, 1000);
		expect(sweeper.isRunning).toBe(false);
	});

	it("should auto-start when option is set", () => {
		const sweeper = new PeriodicSweeper(() => {}, 1000, { autoStart: true });
		jest.advanceTimersByTime(1);
		expect(sweeper.isRunning).toBe(true);
	});

	it("should call sweepFn on interval", () => {
		const fn = jest.fn();
		const sweeper = new PeriodicSweeper(fn, 1000);
		sweeper.start();

		jest.advanceTimersByTime(1500);
		expect(fn).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("should stop the interval", () => {
		const fn = jest.fn();
		const sweeper = new PeriodicSweeper(fn, 1000);
		sweeper.start();

		jest.advanceTimersByTime(500);
		sweeper.stop();
		expect(sweeper.isRunning).toBe(false);

		jest.advanceTimersByTime(2000);
		expect(fn).not.toHaveBeenCalled();
	});
});
