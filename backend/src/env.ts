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
  if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
}
