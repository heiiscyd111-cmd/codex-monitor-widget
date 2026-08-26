import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import packageJson from "../package.json" with { type: "json" };

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arch = process.argv.find(arg => arg.startsWith("--arch="))?.slice(7) || process.arch;
if (!new Set(["arm64", "x64"]).has(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);

const versionArg = process.argv.find(arg => arg.startsWith("--version="))?.slice(10);
const version = (versionArg || `v${packageJson.version}`).replace(/^v?/, "v");
const distDir = path.join(projectRoot, "dist");
const archive = path.join(distDir, `CodexMonitor-${version}-macOS-${arch}.zip`);

const [appPath] = await packager({
  dir: projectRoot,
  name: "CodexMonitor",
  out: path.join(distDir, `macos-${arch}`),
  platform: "darwin",
  arch,
  overwrite: true,
  prune: true,
  icon: path.join(projectRoot, "icon.icns"),
  appBundleId: "io.github.asusfx80.codex-monitor-widget",
  appVersion: packageJson.version,
  executableName: "CodexMonitor",
  electronZipDir: process.env.ELECTRON_ZIP_DIR,
  extendInfo: {
    LSMinimumSystemVersion: "14.0",
    LSUIElement: true,
  },
  ignore: [
    /^\/\.codegraph($|\/)/,
    /^\/dist($|\/)/,
    /^\/docs($|\/)/,
    /^\/scripts($|\/)/,
    /^\/AGENTS\.md$/,
    /^\/CONTEXT\.md$/,
    /^\/icon\.ico$/,
    /^\/set-codex-owner\.ps1$/,
    /^\/watch-foreground\.ps1$/,
    /^\/USAGE\.zh-CN\.txt$/,
    /^\/使用说明\.txt$/,
  ],
});

await rm(archive, { force: true });
const zipped = spawnSync("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, archive], { stdio: "inherit" });
if (zipped.status !== 0) throw new Error("Failed to create macOS ZIP");
console.log(archive);
