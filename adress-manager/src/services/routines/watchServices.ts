import Service from "../adress/adressModel"
import { downAfterControle, ping, updateAfterControl } from "../../utils/requests"
import { params } from "packages"

let { inAppServiceName } = params

export const routineCheck = async (app : any) => {
  let env = app.get("envLoad")
  let logSys = app.get("logSys")
    
  if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté dans le fichier `app.ts` sous le format `logSys`");
  if(!env) throw new Error("Env error : Env n'est pas monté dans le fichier `app.ts` sous le format `envLoad`")

  const service = await Service.find({
    adressIP: env.MACHINE_IP
  })

  if(service.length > 0) {
    let pingAverage = Math.floor((60 * 950) / service.length), i = 0
    // let pingAverage = Math.floor((30 * 60 * 950) / service.length), i = 0
  
    let callService = async () => {
      try{
          await ping(service[i].port)
      }catch(e : any){
        if(e.code == "ECONNREFUSED"){
          downAfterControle({
            adressIP: service[i].adressIP,
            service : service[i].service,
            port : service[i].port,
          }, env).catch(()=>{})

          logSys.ServiceInfo(inAppServiceName.app, `Service : {name : "${service[i].service}", url: "${service[i].adressIP}:${service[i].port}} disconnected`)
        }
        
        if (e.response)  {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          if(e.response.status == 418){
            updateAfterControl({
              adressIP: service[i].adressIP,
              service : service[i].service,
              port : service[i].port,
              status : 2            
            }, env).catch(()=>{})

            logSys.ServiceInfo(inAppServiceName.app, `Service : {name : "${service[i].service}", url: "${service[i].adressIP}:${service[i].port}} No Correct Response`)
          }else{
            downAfterControle({
              adressIP: service[i].adressIP,
              service : service[i].service,
              port : service[i].port,
            }, env).catch(()=>{})

            logSys.ServiceInfo(inAppServiceName.app, `Service : {name : "${service[i].service}", url: "${service[i].adressIP}:${service[i].port}} disconnected`)
          }
        }
      }finally{
        i ++
      }
  
      return setTimeout(() => {
        if(i > service.length) return
        callService()
      }, pingAverage);
    }
  
    callService();
  }

  return setTimeout(() => {
    routineCheck(app)
  }, 60*1000);
  // }, 30*60*1000);
}