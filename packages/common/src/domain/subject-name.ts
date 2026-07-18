/** Subject identity: common name + subject alternative names (SAN). */
export interface SubjectName<T = string> {
	commonName: T;
	san: string[];
}
