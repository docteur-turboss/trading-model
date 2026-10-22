import type { AuthToken, InstanceId } from "./primitives";

export interface TokenValidation {
	token: AuthToken;
	instanceId: InstanceId;
}
