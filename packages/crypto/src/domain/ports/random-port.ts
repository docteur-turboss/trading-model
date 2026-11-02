/** Abstract cryptographically-secure random string source. */
export interface RandomPort {
	generateRandomStr(): string;
}
