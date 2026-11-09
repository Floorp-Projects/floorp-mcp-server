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

/** Where a resolved token came from, for error hints (never the token). */
export type TokenSource = "env" | "file" | "none";

/** Display path of the token file without the user's home directory. */
export const TOKEN_FILE_DISPLAY = "~/.floorp/os-server-token";

/**
 * Tokens Floorp generates are UUIDs. Anything outside visible ASCII would be
 * an invalid HTTP header value, and fetch would echo the whole header (and so
 * the secret) in its error message.
 */
const TOKEN_RE = /^[\x21-\x7E]+$/;

/** True when `token` can be sent as `Authorization: Bearer <token>`. */
export function isHeaderSafeToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export interface ResolvedToken {
  token: string;
  source: TokenSource;
}

/**
 * Bearer token for the OS-Server and its source: `FLOORP_OS_TOKEN` if set,
 * otherwise the browser's token file, otherwise none (requests then go out
 * without a token and the server answers 401 when it requires one).
 *
 * Throws, without including the token, when the token contains characters
 * that cannot be sent in an HTTP header.
 */
export function resolveTokenWithSource(
  options: ResolveOptions = {},
): ResolvedToken {
  const env = options.env ?? process.env;
  const fromEnv = env[TOKEN_ENV]?.trim();
  if (fromEnv) return checked(fromEnv, "env");
  const read = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  let fromFile: string;
  try {
    fromFile = read(tokenFilePath(options.home)).trim();
  } catch {
    return { token: "", source: "none" };
  }
  return fromFile ? checked(fromFile, "file") : { token: "", source: "none" };
}

function checked(token: string, source: "env" | "file"): ResolvedToken {
  if (!TOKEN_RE.test(token)) {
    const where = source === "env" ? TOKEN_ENV : TOKEN_FILE_DISPLAY;
    throw new Error(
      `The OS-Server token from ${where} contains characters that cannot be sent in an HTTP header (spaces, line breaks or non-ASCII); fix ${where}.`,
    );
  }
  return { token, source };
}

/** Like `resolveTokenWithSource`, returning only the token. */
export function resolveToken(options: ResolveOptions = {}): string {
  return resolveTokenWithSource(options).token;
}

/** OS-Server port: `FLOORP_OS_PORT` when it is a valid port, else 58261. */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[PORT_ENV]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PORT;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}
