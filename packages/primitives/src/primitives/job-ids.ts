import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type JobId = BrandedString<"JobId">;
export const JobId = createStringBrand("JobId");
export function toJobId(value: string): JobId {
	return JobId.of(value);
}
export function fromJobId(value: JobId): string {
	return value;
}

export type JobType = BrandedString<"JobType">;
export const JobType = createStringBrand("JobType");
export function toJobType(value: string): JobType {
	return JobType.of(value);
}
export function fromJobType(value: JobType): string {
	return value;
}
