export type Hostname = string & { readonly __brand: "Hostname" };

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const Hostname = {
	of(value: string): Hostname {
		if (value.length > 253 || !HOSTNAME_RE.test(value)) {
			throw new RangeError(
				`Hostname must be a valid DNS hostname, got ${value}`
			);
		}
		return value as Hostname;
	},
};
