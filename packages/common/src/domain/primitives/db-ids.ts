import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type DbUser = BrandedString<"DbUser">;
export const DbUser = createStringBrand("DbUser");
export function toDbUser(value: string): DbUser {
	return DbUser.of(value);
}
export function fromDbUser(value: DbUser): string {
	return value;
}

export type DbPassword = BrandedString<"DbPassword">;
export const DbPassword = createStringBrand("DbPassword", undefined, true);
export function toDbPassword(value: string): DbPassword {
	return DbPassword.of(value);
}
export function fromDbPassword(value: DbPassword): string {
	return value;
}

export type DbName = BrandedString<"DbName">;
export const DbName = createStringBrand("DbName");
export function toDbName(value: string): DbName {
	return DbName.of(value);
}
export function fromDbName(value: DbName): string {
	return value;
}
