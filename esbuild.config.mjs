import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";

const prod = process.argv[2] === "production";

function loadEnv() {
  if (!existsSync(".env")) return {};
  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => l.split("=").map((s) => s.trim()))
  );
}

const env = loadEnv();
const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const configFolder = env.OBSIDIAN_CONFIG_FOLDER;
const vaultPluginDir = configFolder ? `${configFolder}/plugins/${id}` : null;

function copyToVault() {
  if (!vaultPluginDir) return;
  for (const f of ["main.js", "main.css", "manifest.json"]) {
    try { copyFileSync(f, `${vaultPluginDir}/${f}`); } catch {}
  }
  const hotreload = `${vaultPluginDir}/.hotreload`;
  if (!existsSync(hotreload)) {
    try { writeFileSync(hotreload, ""); } catch {}
  }
}

const copyPlugin = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(() => copyToVault());
  },
};

const options = {
  entryPoints: ["src/plugin.ts"],
  bundle: true,
  external: [
    "obsidian", "electron",
    "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands",
    "@codemirror/language", "@codemirror/lint", "@codemirror/search",
    "@codemirror/state", "@codemirror/view",
    "@lezer/common", "@lezer/highlight", "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
};

if (prod) {
  const ctx = await esbuild.context({ ...options, plugins: [] });
  await ctx.rebuild();
  process.exit(0);
} else {
  const ctx = await esbuild.context({ ...options, plugins: [copyPlugin] });
  await ctx.watch();
}
