export function extractServiceName(clientIdentity: string): string | null {
	if (clientIdentity.startsWith("spiffe://")) {
		const parts = clientIdentity.split("/");
		return parts[parts.length - 1] || null;
	}
	if (clientIdentity.startsWith("client:")) {
		return "api-gateway";
	}
	return clientIdentity || null;
}
