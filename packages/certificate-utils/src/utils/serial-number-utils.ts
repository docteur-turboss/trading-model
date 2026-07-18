import { randomUUID } from "node:crypto";
import type { SerialNumber } from "@trading-model/common/domain/primitives";
import { toSerialNumber } from "@trading-model/common/domain/primitives";

export function generateSerialNumber(): SerialNumber {
	return toSerialNumber(
		randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()
	);
}
