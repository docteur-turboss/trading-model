import { ClassResponseExceptions } from "./responseException.js";
import { NextFunction, Request, Response } from "express";
// import { logger } from "../services/logger";


type responseObj = {
    status: number;
    data: string;
}

type errType = Error
| responseObj


/**
 * Middleware global de gestion des erreurs
 * - Standardise le format JSON de sortie
 * - Log les erreurs 500 côté serveur
 */
export const ResponseProtocole = (err: errType, req: Request, res: Response, next: NextFunction) => {
  // let originalError;

  let errResponse;
  if(err instanceof Error){
    // originalError = err;
    errResponse = new ClassResponseExceptions("").UnknownError()
  }else{
    errResponse = err;
  }

  // Log uniquement les erreurs serveur critiques
  if (errResponse.status >= 500) {
    // logger.error("Server Error", {
    //   message: originalError?.message,
    //   stack: originalError?.stack,
    //   url: req.originalUrl,
    //   method: req.method,
    //   ip: req.ip
    // });
  }

  return res.status(errResponse.status).json(errResponse.data);
  next();
};
