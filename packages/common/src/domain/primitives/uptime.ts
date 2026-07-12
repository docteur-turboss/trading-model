export type Uptime = number & { readonly brand: "Uptime" };

export const Uptime = {
	of(value: number): Uptime {
		return value as Uptime;
	},
};
