import assert from "node:assert/strict";
import { test } from "node:test";
import { breakingChanges, releaseTags } from "./schema-compat.mjs";

const base = { type: "object", properties: { a: { type: "string" }, k: { enum: ["x", "y"] } }, required: ["a"] };

test("optional field added, enum value added: compatible", () => {
	const next = { ...base, properties: { ...base.properties, b: { type: "number" }, k: { enum: ["x", "y", "z"] } } };
	assert.deepEqual(breakingChanges(base, next), []);
});

test("field removed: breaking", () => {
	assert.deepEqual(breakingChanges(base, { ...base, properties: { k: base.properties.k } }), ["$.a: field removed"]);
});

test("optional field made required: breaking", () => {
	assert.deepEqual(breakingChanges(base, { ...base, required: ["a", "k"] }), ["$.k: field now required"]);
});

test("type changed: breaking", () => {
	const next = { ...base, properties: { ...base.properties, a: { type: "number" } } };
	assert.match(breakingChanges(base, next)[0], /^\$\.a: type/);
});

test("enum value removed: breaking", () => {
	const next = { ...base, properties: { ...base.properties, k: { enum: ["x"] } } };
	assert.deepEqual(breakingChanges(base, next), ['$.k: enum value "y" removed']);
});

test("release tags keep pre-releases, drop other tags", () => {
	assert.deepEqual(releaseTags("v3.1.0\nv3.1.0-rc.1\nvfoo\nv3.0.0\n"), ["v3.1.0", "v3.1.0-rc.1", "v3.0.0"]);
});
