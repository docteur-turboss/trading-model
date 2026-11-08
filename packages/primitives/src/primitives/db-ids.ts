import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type DbUser = BrandedString<"DbUser">;
export const DbUser = createStringBrand("DbUser");
export type DbPassword = BrandedString<"DbPassword">;
export const DbPassword = createStringBrand("DbPassword", undefined, true);
export type DbName = BrandedString<"DbName">;
export const DbName = createStringBrand("DbName");
