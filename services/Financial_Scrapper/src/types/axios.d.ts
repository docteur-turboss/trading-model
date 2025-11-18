import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    weight?: number;
  }

  export interface InternalAxiosRequestConfig {
    weight?: number;
  }
}