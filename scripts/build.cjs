const { spawn } = require("node:child_process");
const { cpSync, watch } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(root, "src", "webview");
const destination = join(root, "dist", "webview");
const watchMode = process.argv.includes("--watch");
const copyAssets = () => cpSync(source, destination, { recursive: true });

copyAssets();
const watcher = watchMode ? watch(source, copyAssets) : undefined;
const compiler = spawn(process.execPath, [
  require.resolve("typescript/bin/tsc"),
  "-p", root,
  ...(watchMode ? ["--watch"] : []),
], { stdio: "inherit" });

compiler.on("error", (error) => {
  console.error(error);
  watcher?.close();
  process.exitCode = 1;
});
compiler.on("exit", (code) => {
  watcher?.close();
  process.exitCode = code ?? 1;
});