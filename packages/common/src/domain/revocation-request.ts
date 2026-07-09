export enum RevocationReason {
	Unspecified = "unspecified",
	KeyCompromise = "keyCompromise",
	AffiliationChanged = "affiliationChanged",
	Superseded = "superseded",
	CessationOfOperation = "cessationOfOperation",
	CertificateHold = "certificateHold",
	RemoveFromCrl = "removeFromCRL",
	PrivilegeWithdrawn = "privilegeWithdrawn",
	AaCompromise = "aACompromise",
}

import type { SerialNumber } from "./primitives";

export interface RevocationRequest {
	serialNumber: SerialNumber;
	reason: RevocationReason;
}
