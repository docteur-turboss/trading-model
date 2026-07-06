import { z } from "zod";

import { Price, Volume } from "./primitives";

export const PriceSchema = z.number().transform((v) => Price.of(v));
export const VolumeSchema = z.number().transform((v) => Volume.of(v));
