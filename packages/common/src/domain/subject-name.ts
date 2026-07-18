/** Subject identity: common name + subject alternative names (SAN). */
export interface SubjectName<TType = string> {
	commonName: TType;
	san: string[];
}
