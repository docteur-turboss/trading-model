import type { InstanceId } from "./primitives";

export interface TokenValidation {
	token: string;
	instanceId: InstanceId;
}
