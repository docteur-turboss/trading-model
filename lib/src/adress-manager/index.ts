import { Application } from "express";
import { AddressManagerConfig } from "./config/AddressManagerConfig";
import { AddressManagerModule, bootstrapAddressManagerModule } from "./lifecycle/moduleBootstrap";

/**
 * Default export for the Address Manager library.
 *
 * This allows importing the library as:
 * ```ts
 * import adrManager from "cash-lib/adress-manager";
 * ```
 */
export default {
  /**
   * Initializes the Address Manager module.
   *
   * @param app - Express application instance
   * @param config - Address Manager configuration
   * @returns Promise resolving to the public API of the module
   *
   * @example
   * ```ts
   * import adrManager from "cash-lib/adress-manager";
   * 
   * const moduleApi = await adrManager.init(app, config);
   * const userService = await moduleApi.serviceDiscovery.findService("user-service");
   * await moduleApi.stop(); // gracefully stop cron jobs
   * ```
   */
  init: (app: Application, config: AddressManagerConfig): Promise<AddressManagerModule> => {
    return bootstrapAddressManagerModule(app, config);
  }
};