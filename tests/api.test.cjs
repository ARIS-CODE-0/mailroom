const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const {
  AbortController,
  AbortSignal,
} = require("abort-controller/dist/abort-controller");

// Exercise the real client with the same AbortController implementation that
// React Native installs, rather than Node's more capable browser globals.
function loadClient(fetch) {
  const timers = new Map();
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(require.resolve("../src/api.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "react-native") return { Platform: { OS: "ios" } };
      if (name === "expo-secure-store") return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    process: { env: {} },
    AbortController,
    AbortSignal,
    fetch,
    setTimeout(callback, delay) {
      const id = timers.size + 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  return { api: exports.api, timers };
}

test("iOS requests reach fetch without AbortSignal.timeout and clear the timer", async () => {
  assert.equal(typeof AbortSignal.timeout, "undefined");
  let calls = 0;
  const { api, timers } = loadClient(async (url, options) => {
    calls++;
    assert.equal(url, "http://localhost:3035/api/status");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return { ok: true, json: async () => ({ connected: true }) };
  });
  assert.equal((await api.request("/status")).connected, true);
  assert.equal(calls, 1);
  assert.equal(timers.size, 0);
});

test("native timeout aborts the request and clears the timer", async () => {
  let signal;
  const { api, timers } = loadClient(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  const pending = api.request("/status");
  const rejection = assert.rejects(pending, /Serveur inaccessible/);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 90000);
  timer.callback();
  await rejection;
  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
});

test("connection failures clear the timer", async () => {
  const { api, timers } = loadClient(async () => {
    throw new Error("Network request failed");
  });
  await assert.rejects(api.request("/status"), /Serveur inaccessible/);
  assert.equal(timers.size, 0);
});
