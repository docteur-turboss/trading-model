export type Fitness = number & { readonly brand: "Fitness" };

export const Fitness = {
	of(value: number): Fitness {
		return value as Fitness;
	},
};
