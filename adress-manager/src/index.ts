import app from './app';
import { params } from "packages";

import { routineCheck } from "./services/routines/watchServices"

const { inAppServiceName } = params;

/*

  CONNECT API

*/
let main = async () => {
  /* Le système de log défini dans `app.ts` -> à voir dans le dossier ../package ou son ripo git */
  let logSys = app.get("logSys")
  let env = app.get("envLoad")

  if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté dans le fichier `app.ts` sous le format `logSys`");
  if(!env) throw new Error("Env error : Env n'est pas monté dans le fichier `app.ts` sous le format `envLoad`")

  app.listen(env.PORT_ADRESSMANAGER, env.IP_ADRESSMANAGER, () => {
    logSys.ServiceInfo(inAppServiceName.app, `Connect Url : ${env.IP_ADRESSMANAGER}:${env.PORT_ADRESSMANAGER}`)

    console.log(`Connect Url : ${env.IP_ADRESSMANAGER}:${env.PORT_ADRESSMANAGER}`)
  })

  /* Supprime les services qui n'ont plus de signaux ping lors d'un check */
  routineCheck(app)
}

main()