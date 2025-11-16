import { Response } from "express";
import ChainedError from "chained-error";
// import { logger } from "../services/logger";
import { ResponseException, ResponseCodeKey, HTTP_CODE } from "./responseException";

type fileHandle = "auth"|"newsletter"|"settings"|"user"|"contact"|"transaction"|"kiff-score"
export type CoreResponse<T = string> = Promise<[T, string]>;

/**
 * Utilitaire générique pour renvoyer une réponse standardisée depuis un core service
 */
export async function handleCoreResponse(coreFn: () => Promise<[unknown, string]>, res: Response) {
  const [response, code] = await coreFn();
  const clientResponse = ResponseException(response)[code as ResponseCodeKey]();
  res.status(clientResponse.status).json(clientResponse);
}

/**
 * Utilitaire générique pour renvoyer une réponse standardisée depuis un core service
 */
export async function handleCoreAuthResponse(coreFn: () => Promise<[unknown, string]>, res: Response) {
  const [response, code] = await coreFn();
  const clientResponse = ResponseException(response)[code as ResponseCodeKey]();
  res.status(clientResponse.status).cookie("token", clientResponse.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7j
    path: "/",
  }).json(clientResponse);
}

/**
 * Vérifie qu'au moins un champ est fourni
 */
export function ensureAtLeastOneField(fields: Record<string, unknown>) {
  if (!Object.values(fields).some(Boolean)) {
    throw ResponseException("Aucun paramètres fournis").BadRequest();
  }
}

/** 
 * Gestion des erreurs DB communes (duplicate / not found) 
 */
export const handleDBError = () => (e: unknown) => {
  if (e instanceof ChainedError) {
    const msg = e.message ?? "";
    if (msg.includes("No result returned")) throw new Error("404");
    if (msg.includes("Duplicate entry")){
      if (msg.includes("name_UNIQUE")) throw new Error("Nom exist");
      if (msg.includes("email_UNIQUE")) throw new Error("Email exist");
    }
  }

//   logger.error(`${file}.${context} (${file}.models.ts)`, e);
  throw e;
};

/** 
 * Gestion centralisée des erreurs de core
 */
export const handleCoreError = (
  file: fileHandle, 
  context: string, 
  e: unknown, 
  mapping: Record<string, [string, string]>
): [string, string] | never => {
  if (e instanceof Error && mapping[e.message]) return mapping[e.message];

//   logger.error(`${context} (${file}.core.ts)`, e);
  throw e;
};

/** 
 * Wrapper générique pour récupérer uniquement les données d'un core et gérer les erreurs 
 */
export const handleOnlyDataCore = async <T>(
  fn: () => Promise<T>,
  errorMap: Record<string, [string, string]> = {},
  file: fileHandle,
  context: string
): Promise<CoreResponse<T | string>> => {
  try {
    const result = await fn();
    return [result, HTTP_CODE.Success];
  } catch (e) {
    return handleCoreError(file, context, e, errorMap)
  }
};