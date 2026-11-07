import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type AuthToken = BrandedString<"AuthToken">;
export const AuthToken = createStringBrand("AuthToken");
export function toAuthToken(value: string): AuthToken {
	return AuthToken.of(value);
}
export type ClientIdentity = BrandedString<"ClientIdentity">;
export const ClientIdentity = createStringBrand("ClientIdentity");
export type UserId = BrandedString<"UserId">;
export const UserId = createStringBrand("UserId");
export type ProcessId = BrandedString<"ProcessId">;
export const ProcessId = createStringBrand("ProcessId");
export type Subject = BrandedString<"Subject">;
export const Subject = createStringBrand("Subject");
export function toSubject(value: string): Subject {
	return Subject.of(value);
}
export type Role = BrandedString<"Role">;
export const Role = createStringBrand("Role");
export function toRole(value: string): Role {
	return Role.of(value);
}
export type Environment = BrandedString<"Environment">;
export const Environment = createStringBrand("Environment");
export function toEnvironment(value: string): Environment {
	return Environment.of(value);
}
