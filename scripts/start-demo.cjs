/* Bootstrap the standard Next server; this is not a custom HTTP/WebSocket server. */
const { randomBytes } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");

async function start() {
  if (!process.env.SESSION_SECRET?.trim()) {
    try {
      const directory = path.join(process.cwd(), "data", "runtime");
      const secretPath = path.join(directory, "session-secret");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try { await writeFile(secretPath, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      const secret = (await readFile(secretPath, "utf8")).trim();
      if (Buffer.byteLength(secret) < 32) throw new Error("Invalid stored session secret");
      process.env.SESSION_SECRET = secret;
    } catch {
      // Other screens and local file imports remain available when runtime storage fails.
      console.warn("Demo identity unavailable: configure SESSION_SECRET or writable data/runtime.");
    }
  }
  const standalone = path.join(process.cwd(), "server.js");
  if (existsSync(standalone)) require(standalone);
  else {
    const next = require.resolve("next/dist/bin/next");
    process.argv = [process.execPath, next, "start", ...process.argv.slice(2)];
    require(next);
  }
}
start().catch((error) => { console.error(error.message); process.exitCode = 1; });
