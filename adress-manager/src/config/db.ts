import { params } from "packages";
import mongoose from "mongoose";

let { inAppServiceName } = params

export const connectDatabase = (app : any) => {
  let logSys = app.get("logSys")
  let env = app.get("envLoad")

  if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté dans le fichier `app.ts` sous le format `logSys`");
  if(!env) throw new Error("Env error : Env n'est pas monté dans le fichier `app.ts` sous le format `envLoad`")
  
  mongoose.connect(env.URLDB)
  .then(() => {
    logSys.ServiceInfo(inAppServiceName.mongoose, "Connected")
  }).catch((error) => {
    logSys.UnknowAppError(inAppServiceName.mongoose, error)
  });
}