/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_PORT,
  resolvePort,
  resolveToken,
  tokenFilePath,
} from "../src/auth.js";

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
