import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type AuthToken = BrandedString<"AuthToken">;
export const AuthToken = createStringBrand("AuthToken");
export function toAuthToken(value: string): AuthToken {
	return AuthToken.of(value);
}
export function fromAuthToken(value: AuthToken): string {
	return value;
}

export type ClientIdentity = BrandedString<"ClientIdentity">;
export const ClientIdentity = createStringBrand("ClientIdentity");
export function toClientIdentity(value: string): ClientIdentity {
	return ClientIdentity.of(value);
}
export function fromClientIdentity(value: ClientIdentity): string {
	return value;
}

export type UserId = BrandedString<"UserId">;
export const UserId = createStringBrand("UserId");
export function toUserId(value: string): UserId {
	return UserId.of(value);
}
export function fromUserId(value: UserId): string {
	return value;
}

export type SessionId = BrandedString<"SessionId">;
export const SessionId = createStringBrand("SessionId");
export function toSessionId(value: string): SessionId {
	return SessionId.of(value);
}
export function fromSessionId(value: SessionId): string {
	return value;
}

export type Subject = BrandedString<"Subject">;
export const Subject = createStringBrand("Subject");
export function toSubject(value: string): Subject {
	return Subject.of(value);
}
export function fromSubject(value: Subject): string {
	return value;
}

export type Role = BrandedString<"Role">;
export const Role = createStringBrand("Role");
export function toRole(value: string): Role {
	return Role.of(value);
}
export function fromRole(value: Role): string {
	return value;
}

export type Environment = BrandedString<"Environment">;
export const Environment = createStringBrand("Environment");
export function toEnvironment(value: string): Environment {
	return Environment.of(value);
}
export function fromEnvironment(value: Environment): string {
	return value;
}
