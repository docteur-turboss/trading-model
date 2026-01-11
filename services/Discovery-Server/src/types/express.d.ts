import "express";

declare module "express" {
  export interface Request {
    clientIdentity: string;
  }
}