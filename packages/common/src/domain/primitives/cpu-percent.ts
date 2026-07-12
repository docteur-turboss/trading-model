export type CpuPercent = number & { readonly brand: "CpuPercent" };

export const CpuPercent = {
	of(value: number): CpuPercent {
		return value as CpuPercent;
	},
};
