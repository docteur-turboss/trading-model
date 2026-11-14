import { createStringBrand } from "./branded-utils";

export type FilePath = string & { readonly brand: "FilePath" };

export const FilePath = createStringBrand<"FilePath">("FilePath");
