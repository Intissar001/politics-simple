import { json } from "../_lib/util.js";
import { COUNTRIES } from "../_lib/countries.js";

export const onRequestGet = () =>
  json(COUNTRIES, 200, { "cache-control": "public, max-age=86400" });
