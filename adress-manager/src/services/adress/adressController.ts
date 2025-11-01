import { ResponseException, utils, middleware, params } from "packages";
import { NextFunction, Request, Response } from "express";
import Service from "./adressModel";

let { mongooseMessageErrorFormator } = utils
let { inAppServiceName } = params
let { catchSync } = middleware

interface ServiceResponse {
  adressIP: string;
  service: string;
  status: Number;
  port: number;
  __v?: number;
  _id?: string;
}

let cacheServices = {
  time : Date.now(),
  service : {}
}

export const addService = catchSync(async (req: Request, res : Response, next : NextFunction) => {
  let { port, adressIP, service } = req.body;
  
  let update = {
    port,
    service,
    adressIP,
  }

  let filter = {
    port,
    service,
    adressIP,
  }

  dataService(update, filter, req, next)
});

export const readService = catchSync(async (req: Request) => {
  const { service, ip } = req.body;
  if (!service)
    throw new ResponseException("Aucun service fournit").BadRequest();
  if(!ip)
    throw new ResponseException("Aucune ip fournit").BadRequest();

  /* @ts-ignore */
  if(cacheServices.time < Date.now() - 60 * 1000 || !cacheServices.service[service]){
    let serviceDB = await Service.find({
      service : {
        $regex: service,
        $options: "i",
      },
      status : 1
    });
      
    if (!serviceDB || !serviceDB[0])
      throw new ResponseException("Aucun Service trouvé").NotFound();

    /* @ts-ignore */
    cacheServices.service[service] = serviceDB
    cacheServices.time = Date.now()
  }

  /* @ts-ignore */
  let serviceTMP : [ServiceResponse] = cacheServices.service[service].filter(e => e.adressIP == ip) ;
  
  if(!serviceTMP[0]) throw new ResponseException("Aucun service trouvé pour votre ip").NotFound();
  
  /* @ts-ignore */
  let serviceResponse : ServiceResponse = serviceTMP[Math.floor(Math.random() * serviceTMP.length)]

  let Response = JSON.stringify(AdressNormalizer(serviceResponse))
  throw new ResponseException(Response).Success();
});

export const deleteService = catchSync(async (req: Request, res : Response, next : NextFunction) => {
  const { adressIP, port, service } = req.body;
  if(!adressIP || !port || !service) throw new ResponseException("Au moins un champ est manquant").BadRequest()

  next(new ResponseException("Service supprimé des annuaires").Success());

  try{
    await Service.findOneAndDelete({
      $and: [
        { adressIP },
        { service },
        { port }, 
      ],
    });
  }catch(e : any){
    let logSys = req.app.get("logSys")
    if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté sur le chemin `logSys`")

    logSys.UnknowAppError(inAppServiceName.mongoose, e)
  }
});

export const updateService = catchSync(async (req: Request, res : Response, next : NextFunction) => {
  let { port, adressIP, service, status } = req.body;
  
  let update = {
    port,
    service,
    adressIP,
    status
  }

  let filter = {
    port,
    service,
    adressIP,
  }

  dataService(update, filter, req, next)
})

let dataService = async (update : object, filter: object, req : Request, next : NextFunction) => {
  try{
    const validateCheck = new Service(update)
    const error = validateCheck.validateSync()
    if(error) throw error

    next(new ResponseException("Service enregistré").OK());

    await Service.findOneAndUpdate(filter, update, {
      upsert: true, new: true, setDefaultsOnInsert: true
    });
  }catch(e : any){
    if(e.name && e.name == "ValidationError") {
      if(e.errors.port){
        throw new ResponseException(mongooseMessageErrorFormator(e.errors.port.message, e.errors.port.value, "Port", "number"))
        .BadRequest();
      }

      if(e.errors.service){
        throw new ResponseException(mongooseMessageErrorFormator(e.errors.service.message, e.errors.service.value, "Service", "string"))
        .BadRequest();
      }

      if(e.errors.status){
        throw new ResponseException(mongooseMessageErrorFormator(e.errors.status.message, e.errors.status.value, "Status", "number"))
        .BadRequest();
      }

      if(e.errors.adressIP){
        throw new ResponseException(mongooseMessageErrorFormator(e.errors.adressIP.message, e.errors.adressIP.value, "IP adress", "ip"))
        .BadRequest();
      }
    }

    let logSys = req.app.get("logSys")
    if(!logSys) throw new Error("LogSys error : LogSys n'est pas monté sur le chemin `logSys`")

    logSys.UnknowAppError(inAppServiceName.mongoose, e)
    throw new ResponseException().UnknownError()
  }
}

const AdressNormalizer = (serviceData : any) => {
  let { service, port, adressIP, status } = serviceData

  return {
      adressIP,
      service,
      status,
      port,
  }
}