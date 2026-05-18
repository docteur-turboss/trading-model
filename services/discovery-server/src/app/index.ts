import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { LeaseManagerInstance } from "../core/LeaseManager";
import { createServer } from "./server";
import "config/env";

createBootstrap({
  name: "Discovery",
  createServer,
  onStart: () => {
    LeaseManagerInstance.start();
  },
  onStop: () => {
    LeaseManagerInstance.stop();
  },
});
