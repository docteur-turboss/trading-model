export function getLoadColor(value: number): string {
	if (value > 80) {
		return "#d32f2f";
	}
	if (value > 60) {
		return "#ed6c02";
	}
	return "#1976d2";
}
