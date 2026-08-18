/**
 * Loads backend/.env into process.env if the file exists.
 *
 * No dependency: Node has done this since 21.7. The file is gitignored by the
 * bare `.env` entry at the repo root, which matches at any depth, so a key
 * placed here cannot be committed by accident.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(here, "..", ".env");

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  // Never in production. On Vercel the keys arrive as real environment
  // variables and there is no .env file to find, so this would be a pointless
  // filesystem probe at best. Guarding on NODE_ENV makes the claim true by
  // construction rather than true by the file happening to be absent.
  if (process.env["NODE_ENV"] === "production") return;

  if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
}
