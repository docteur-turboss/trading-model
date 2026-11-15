import { describe, expect, it } from "@jest/globals";
import { cronMaxGapMs } from "../../../src/domain/cron-period";

const DAY = 86_400_000;

describe("cronMaxGapMs", () => {
	it.each([
		["5 * * * *", DAY / 24],
		["*/5 * * * *", 300_000],
		["0 0 * * *", DAY],
		["7 15 * * 1-5", 3 * DAY],

		["0 9 * * 7", 7 * DAY],
		["0 0 1 */3 *", 92 * DAY],
		["0 0 1,15 * 1", 7 * DAY],
	])("%s", (expression, gap) => {
		const found = cronMaxGapMs(expression);

		expect(found).toBeGreaterThanOrEqual(gap - 3 * DAY);
		expect(found).toBeLessThanOrEqual(gap + 3 * DAY);
	});

	it("reads a yearly cron", () => {
		expect(cronMaxGapMs("0 0 1 1 *")).toBeGreaterThanOrEqual(365 * DAY);
	});

	it.each([
		"0 9 * * mon",
		"0 0 1 jan *",
		"0 0 0 * * *",
		"0 0 29 2 *",
		"*/0 * * * *",
		"1-5/0 * * * *",
	])("cannot read %s", (expression) => {
		expect(cronMaxGapMs(expression)).toBeUndefined();
	});
});
