import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";
import { ENV } from "../infrastructure/config/env";

type ServiceAddressManager = ReturnType<typeof createServiceAddressManager>;

// No registration with discovery-server: no reader of the registry is left (ADR-0072).
const addressManager = createServiceAddressManager(ENV);

// Annotated: the inferred type names @types/express, which this service no longer depends on.
export const ADDRESS_MANAGER_ROUTES: ServiceAddressManager["ADDRESS_MANAGER_ROUTES"] =
	addressManager.ADDRESS_MANAGER_ROUTES;
export const FIND_A_SERVICE = addressManager.FIND_A_SERVICE;
