export type Port = number & { readonly brand: "Port" };

export const Port = {
	of(value: number): Port {
		if (!Number.isInteger(value) || value < 0 || value > 65535) {
			throw new RangeError(
				`Port must be an integer between 0 and 65535, got ${value}`
			);
		}
		return value as Port;
	},
};
