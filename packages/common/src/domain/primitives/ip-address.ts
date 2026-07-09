export type IPAddress = string & { readonly brand: "IPAddress" };

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

export const IPAddress = {
	of(value: string): IPAddress {
		if (!(IPV4_RE.test(value) || IPV6_RE.test(value))) {
			throw new RangeError(
				`IPAddress must be a valid IPv4 or IPv6 address, got ${value}`
			);
		}
		return value as IPAddress;
	},
};
