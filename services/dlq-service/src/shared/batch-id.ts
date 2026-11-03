import { randomUUID } from "node:crypto";

export function generateBatchId(prefix: string): string {
	return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
