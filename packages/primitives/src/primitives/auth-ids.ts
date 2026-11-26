import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type ClientIdentity = BrandedString<"ClientIdentity">;
export const ClientIdentity = createStringBrand("ClientIdentity");
export type Subject = BrandedString<"Subject">;
export const Subject = createStringBrand("Subject");
export type Role = BrandedString<"Role">;
export const Role = createStringBrand("Role");
