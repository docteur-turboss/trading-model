// Backward-compatibility rules between two JSON Schemas of the same message
// (ADR-0061): what the previous release produced must still be accepted and
// understood by the current one. Pure function, no I/O.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Breaking changes from `oldS` (previous release) to `newS`.
 * Breaking: property removed, property newly required, type changed,
 * enum/const value removed, array item or union branch made incompatible.
 * Compatible: optional property added, enum value added.
 * shortcut: union (anyOf/oneOf/allOf) branches are compared by index and the
 * branch count may not shrink; reordering a union reports a false break
 * (declare it in the exceptions file).
 * @returns {string[]} one line per break, prefixed by the JSON path
 */
export function breakingChanges(oldS, newS, path = "$") {
	if (oldS === undefined || typeof oldS !== "object") return [];
	if (newS === undefined || typeof newS !== "object") return [`${path}: schema removed`];
	const out = [];
	if (!same(oldS.type, newS.type)) out.push(`${path}: type ${JSON.stringify(oldS.type)} -> ${JSON.stringify(newS.type)}`);
	if (oldS.const !== undefined && !same(oldS.const, newS.const)) out.push(`${path}: const ${JSON.stringify(oldS.const)} changed`);
	for (const v of oldS.enum ?? []) {
		if (!(newS.enum ?? []).some((n) => same(n, v))) out.push(`${path}: enum value ${JSON.stringify(v)} removed`);
	}
	const newProps = newS.properties ?? {};
	for (const [name, sub] of Object.entries(oldS.properties ?? {})) {
		if (name in newProps) out.push(...breakingChanges(sub, newProps[name], `${path}.${name}`));
		else out.push(`${path}.${name}: field removed`);
	}
	for (const name of newS.required ?? []) {
		if (!(oldS.required ?? []).includes(name)) out.push(`${path}.${name}: field now required`);
	}
	if (oldS.items) out.push(...breakingChanges(oldS.items, newS.items, `${path}[]`));
	if (oldS.additionalProperties && typeof oldS.additionalProperties === "object") {
		out.push(...breakingChanges(oldS.additionalProperties, newS.additionalProperties, `${path}{}`));
	}
	for (const key of ["anyOf", "oneOf", "allOf"]) {
		const olds = oldS[key] ?? [];
		const news = newS[key] ?? [];
		if (news.length < olds.length) out.push(`${path}: ${key} branch removed`);
		olds.forEach((b, i) => {
			if (news[i]) out.push(...breakingChanges(b, news[i], `${path}.${key}[${i}]`));
		});
	}
	return out;
}
