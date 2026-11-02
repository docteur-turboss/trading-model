import { Price, Volume } from "@trading-model/primitives/primitives";
import { z } from "zod";

export const PriceSchema = z.number().transform((value) => Price.of(value));
export const VolumeSchema = z.number().transform((value) => Volume.of(value));
