import { z } from "zod";

import { Price, Volume } from "../../domain/primitives";

export const PriceSchema = z.number().transform((value) => Price.of(value));
export const VolumeSchema = z.number().transform((value) => Volume.of(value));
