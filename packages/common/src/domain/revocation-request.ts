export enum RevocationReason {
	UNSPECIFIED = "unspecified",
	KEY_COMPROMISE = "keyCompromise",
	AFFILIATION_CHANGED = "affiliationChanged",
	SUPERSEDED = "superseded",
	CESSATION_OF_OPERATION = "cessationOfOperation",
	CERTIFICATE_HOLD = "certificateHold",
	REMOVE_FROM_CRL = "removeFromCRL",
	PRIVILEGE_WITHDRAWN = "privilegeWithdrawn",
	AA_COMPROMISE = "aACompromise",
}

export interface RevocationRequest {
	serialNumber: string;
	reason: RevocationReason;
}
