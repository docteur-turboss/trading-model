import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { ErrorCode } from "../../src/utils/errors";

const catalog = readFileSync(
	join(__dirname, "../../../../docs/reference/error-codes.md"),
	"utf8"
);

describe("docs/reference/error-codes.md", () => {
	it.each(Object.values(ErrorCode))("has a row for %s", (code) => {
		const row = catalog
			.split(/\r?\n/)
			.find((line) => line.startsWith(`| \`${code}\` |`));
		expect(row).toMatch(/^\| `\w+` \| \d{3} \| .+ \| .+ \|$/);
	});
});
