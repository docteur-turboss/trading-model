import { describe, expect, it } from "@jest/globals";
import { EntrySerializer } from "../../src/shared/entry-serializer";

const base = {
	topic: "t",
	message: { a: 1 },
	reason: "OPEN",
	messageId: "m-1",
	deliveryAttempt: 1,
	timestamp: 1,
};

describe("EntrySerializer.computeHash", () => {
	const s = new EntrySerializer();

	it("gives two services failing on the same message distinct keys", () => {
		const a = s.computeHash({ ...base, service: "A" } as never);
		const b = s.computeHash({ ...base, service: "B" } as never);
		expect(a.messageId).not.toBe(b.messageId);
		expect(a.contentHash).not.toBe(b.contentHash);
	});

	it("gives the same service the same key (dedup)", () => {
		const a = s.computeHash({ ...base, service: "A" } as never);
		expect(s.computeHash({ ...base, service: "A" } as never)).toEqual(a);
	});

	it("keeps the former key for entries without service", () => {
		expect(s.computeHash(base as never).messageId).toBe("m-1");
		const { messageId: _omit, ...noId } = base;
		const h = s.computeHash(noId as never);
		expect(h.messageId).toBe(h.contentHash);
	});
});
