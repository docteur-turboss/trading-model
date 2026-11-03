export type AuditSummary = string & { readonly brand: "AuditSummary" };

export function toAuditSummary(value: string): AuditSummary {
	return AuditSummary.of(value);
}

export function fromAuditSummary(value: AuditSummary): string {
	return value;
}

export const AuditSummary = {
	of(value: string): AuditSummary {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`AuditSummary must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as AuditSummary;
	},
};
