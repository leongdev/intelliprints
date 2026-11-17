import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { platform, arch } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const version = "0.40.6";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binDir = path.join(root, "bin");
const binary = path.join(binDir, process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
const run = promisify(execFile);

const osName = platform() === "darwin" ? "darwin" : platform() === "linux" ? "linux" : null;
const cpu = arch() === "arm64" ? "arm64" : arch() === "x64" ? "amd64" : null;
if (!osName || !cpu) {
  throw new Error(`Unsupported platform ${platform()} ${arch()}`);
}

await mkdir(binDir, { recursive: true });

try {
  await access(binary);
  console.log("PocketBase binary already present.");
} catch {
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${osName}_${cpu}.zip`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status})`);
  }
  const zipPath = path.join(binDir, "pocketbase.zip");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));
  await run("unzip", ["-o", zipPath, "-d", binDir]);
  await chmod(binary, 0o755);
}

await run(binary, [
  "superuser",
  "upsert",
  "admin@intelliprints.local",
  "intelli-admin",
  "--dir",
  path.join(root, "pb_data"),
]);

console.log("Superuser ready at http://127.0.0.1:8090/_/");
console.log("  admin@intelliprints.local / intelli-admin");
console.log("");
console.log("Next, in two terminals:");
console.log("  npm run pocketbase");
console.log("  npm run bootstrap && npm run dev");
