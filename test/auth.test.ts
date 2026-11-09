/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { homedir } from "node:os";
import {
  DEFAULT_PORT,
  isHeaderSafeToken,
  resolvePort,
  resolveToken,
  resolveTokenWithSource,
  tokenFilePath,
} from "../src/auth.js";
import { unauthorizedHint } from "../src/client.js";

const HOME = join("home", "tester");

test("token file lives under ~/.floorp like the browser writes it", () => {
  assert.equal(tokenFilePath(HOME), join(HOME, ".floorp", "os-server-token"));
});

test("FLOORP_OS_TOKEN wins over the token file", () => {
  const token = resolveToken({
    env: { FLOORP_OS_TOKEN: "  from-env \n" },
    home: HOME,
    readFile: () => "from-file",
  });
  assert.equal(token, "from-env");
});

test("the token file is used and trimmed when no env token is set", () => {
  const reads: string[] = [];
  const token = resolveToken({
    env: { FLOORP_OS_TOKEN: "   " },
    home: HOME,
    readFile: (path) => {
      reads.push(path);
      return "abc-123\n";
    },
  });
  assert.equal(token, "abc-123");
  assert.deepEqual(reads, [tokenFilePath(HOME)]);
});

test("a missing token file yields no token instead of throwing", () => {
  const token = resolveToken({
    env: {},
    home: HOME,
    readFile: () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  });
  assert.equal(token, "");
});

test("FLOORP_OS_PORT accepts only valid ports", () => {
  assert.equal(resolvePort({}), DEFAULT_PORT);
  assert.equal(resolvePort({ FLOORP_OS_PORT: "58361" }), 58361);
  for (const bad of ["0", "65536", "abc", "-1", "1e3", ""]) {
    assert.equal(resolvePort({ FLOORP_OS_PORT: bad }), DEFAULT_PORT, bad);
  }
});

test("tokens with header-unsafe characters are refused without echoing them", () => {
  const secret = "abc\ndef";
  for (const [env, file] of [
    [{ FLOORP_OS_TOKEN: secret }, "unused"],
    [{}, `${secret}\r\n`],
    [{}, "tok en"],
    [{}, "tökén"],
  ] as const) {
    assert.throws(
      () => resolveTokenWithSource({ env, home: HOME, readFile: () => file }),
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes("abc") &&
        !error.message.includes("def") &&
        /cannot be sent in an HTTP header/.test(error.message),
    );
  }
  assert.equal(isHeaderSafeToken("3f2b8c1e-0d4a-4e5f-9a6b-7c8d9e0f1a2b"), true);
});

test("CRLF and BOM around a file token are trimmed; the source is reported", () => {
  assert.deepEqual(
    resolveTokenWithSource({ env: {}, home: HOME, readFile: () => "﻿abc\r\n" }),
    { token: "abc", source: "file" },
  );
  assert.deepEqual(
    resolveTokenWithSource({ env: { FLOORP_OS_TOKEN: "xyz" }, home: HOME }),
    { token: "xyz", source: "env" },
  );
  assert.deepEqual(
    resolveTokenWithSource({ env: {}, home: HOME, readFile: () => "  \n" }),
    { token: "", source: "none" },
  );
});

test("401 hints name the token source and never the home directory", () => {
  for (const source of ["env", "file", "explicit", "none"] as const) {
    const hint = unauthorizedHint(source);
    assert.ok(!hint.includes(homedir()), `${source}: ${hint}`);
  }
  assert.match(unauthorizedHint("env"), /FLOORP_OS_TOKEN was rejected/);
  assert.match(unauthorizedHint("file"), /~\/\.floorp\/os-server-token was rejected/);
});
