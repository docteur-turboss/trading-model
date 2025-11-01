import { ClassResponseExceptions } from "./responseException";
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
  let originalError;

  if(err instanceof Error){
    originalError = err;
    err = new ClassResponseExceptions("").UnknownError()
  }

  // Log uniquement les erreurs serveur critiques
  if (err.status >= 500) {
    // logger.error("Server Error", {
    //   message: originalError?.message,
    //   stack: originalError?.stack,
    //   url: req.originalUrl,
    //   method: req.method,
    //   ip: req.ip
    // });
  }

  return res.status(err.status).json(err);
  next();
};
