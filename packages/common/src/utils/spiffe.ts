import { ServiceId } from "../domain/primitives";

export function extractServiceName(clientIdentity: string): ServiceId | null {
	if (clientIdentity.startsWith("spiffe://")) {
		const parts = clientIdentity.split("/");
		return ServiceId.of(parts[parts.length - 1] || "");
	}
	if (clientIdentity.startsWith("client:")) {
		return ServiceId.of("api-gateway");
	}
	return clientIdentity ? ServiceId.of(clientIdentity) : null;
}
