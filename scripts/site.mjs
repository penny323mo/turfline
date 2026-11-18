import * as esbuild from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dev = process.argv.includes("--dev"),
  preview = process.argv.includes("--preview");
const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const port =
  portArg === -1 ? (preview ? 4174 : 4173) : Number(args[portArg + 1]);
const output = path.join(root, dev ? ".dev-site" : "dist");
const pages = ["index.html", "studio.html"];
const options = {
  absWorkingDir: root,
  entryPoints: [
    "src/arcade.js",
    "src/main.js",
    "src/style.css",
    "src/game.css",
  ],
  outdir: path.join(output, "assets"),
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  minify: !dev,
  metafile: true,
  entryNames: dev ? "[name]" : "[name]-[hash]",
  chunkNames: "chunks/[name]-[hash]",
  external: ["../fonts/*"],
  legalComments: "eof",
  logLevel: "warning",
};
async function html(meta) {
  const names = new Map(
    Object.entries(meta.outputs)
      .filter(([, v]) => v.entryPoint)
      .map(([k, v]) => [
        v.entryPoint,
        path.relative(output, path.resolve(root, k)),
      ]),
  );
  for (const page of pages) {
    let source = await readFile(path.join(root, page), "utf8");
    for (const [from, to] of names)
      source = source.replaceAll("./" + from, "./" + to);
    if (dev)
      source = source.replace(
        "</body>",
        '<script>new EventSource("/esbuild").addEventListener("change",()=>location.reload());</script></body>',
      );
    await writeFile(path.join(output, page), source);
  }
}
if (preview) {
  const ctx = await esbuild.context({
    stdin: { contents: "", resolveDir: root },
    write: false,
    logLevel: "silent",
  });
  await ctx.serve({ host: "127.0.0.1", port, servedir: output });
  console.log("Turfline preview http://127.0.0.1:" + port + "/");
} else {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, "public"), output, { recursive: true });
  if (dev) {
    let meta;
    options.plugins = [
      {
        name: "site-pages",
        setup(build) {
          build.onEnd(async (result) => {
            if (result.metafile && !result.errors.length) {
              meta = result.metafile;
              await html(meta);
            }
          });
        },
      },
    ];
    const ctx = await esbuild.context(options);
    await ctx.watch();
    for (const page of pages)
      watch(path.join(root, page), () => {
        if (meta) html(meta).catch(console.error);
      });
    watch(path.join(root, "public"), { recursive: true }, async (_, file) => {
      if (!file) return;
      const src = path.join(root, "public", file),
        dest = path.join(output, file);
      try {
        await mkdir(path.dirname(dest), { recursive: true });
        await cp(src, dest, { recursive: true });
      } catch (e) {
        if (e.code === "ENOENT")
          await rm(dest, { recursive: true, force: true });
        else console.error(e);
      }
    });
    await ctx.serve({ host: "127.0.0.1", port, servedir: output });
    console.log("Turfline dev http://127.0.0.1:" + port + "/");
  } else {
    const { metafile } = await esbuild.build(options);
    await html(metafile);
    await writeFile(path.join(output, ".nojekyll"), "");
    console.log("Built both Turfline pages and local assets in dist/");
  }
}
