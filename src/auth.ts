/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Default port of the Floorp OS-Server (pref `floorp.os.server.port`). */
export const DEFAULT_PORT = 58261;

/** Environment variable that overrides the OS-Server bearer token. */
export const TOKEN_ENV = "FLOORP_OS_TOKEN";

/** Environment variable that overrides the OS-Server port. */
export const PORT_ENV = "FLOORP_OS_PORT";

/**
 * Path of the token file the browser writes on startup
 * (`~/.floorp/os-server-token`, see os-server/server.sys.mts).
 */
export function tokenFilePath(home: string = homedir()): string {
  return join(home, ".floorp", "os-server-token");
}

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  readFile?: (path: string) => string;
}

/**
 * Bearer token for the OS-Server: `FLOORP_OS_TOKEN` if set, otherwise the
 * browser's token file, otherwise "" (requests then go out without a token
 * and the server answers 401 when it requires one).
 */
export function resolveToken(options: ResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const fromEnv = env[TOKEN_ENV]?.trim();
  if (fromEnv) return fromEnv;
  const read = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  try {
    return read(tokenFilePath(options.home)).trim();
  } catch {
    return "";
  }
}

/** OS-Server port: `FLOORP_OS_PORT` when it is a valid port, else 58261. */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[PORT_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}
