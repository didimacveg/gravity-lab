import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Reference } from "../js/sim.js";

const here = dirname(fileURLToPath(import.meta.url));
export const dataDir = join(here, "..", "data");

export const meta = JSON.parse(readFileSync(join(dataDir, "horizons.json"), "utf8"));
const buf = readFileSync(join(dataDir, "horizons_planets.f64"));
export const reference = new Reference(
  new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), meta);
export const table = JSON.parse(readFileSync(join(dataDir, "validation.json"), "utf8"));
