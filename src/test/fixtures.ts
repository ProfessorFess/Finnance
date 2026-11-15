import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/server/import/__fixtures__");

/** A synthetic import fixture as text. */
export const fixture = (name: string): string => readFileSync(join(DIR, name), "utf8");

/** A synthetic import fixture as raw bytes. */
export const fixtureBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(join(DIR, name)));
