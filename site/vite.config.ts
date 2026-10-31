import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type Rolldown } from "vite";
import { proofPlugin } from "./scripts/proof.mts";

// The landing page and docs site, built from the repository's own dependencies (no
// package of its own). Pages serves it at https://ui.ouro.bot/.
// `pnpm site:build` builds the client, then a server bundle that prerenders every route
// to static HTML (site/scripts/prerender.mts), so each docs URL is readable without
// JavaScript, by people and by agents.
const repo = fileURLToPath(new URL("..", import.meta.url));

/** Build-only attribution, without publishing absolute machine or dependency-cache paths. */
export function chunkEvidence(root: string): Plugin {
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  const sourceName = (id: string) => {
    const path = id.replace(/^\0/, "").replaceAll("\\", "/");
    const dependency = path.lastIndexOf("/node_modules/");
    if (dependency !== -1) return path.slice(dependency + 1);
    if (path.startsWith(prefix)) return path.slice(prefix.length);
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) throw new Error("Build evidence cannot publish a module outside the source/dependency roots");
    return path;
  };
  return {
    name: "site-chunk-evidence",
    apply: "build",
    generateBundle(_options, bundle) {
      const modules = Object.fromEntries(Object.values(bundle).flatMap((chunk) =>
        chunk.type === "chunk" ? [[chunk.fileName, Object.keys(chunk.modules).map(sourceName).sort()]] : [],
      ));
      this.emitFile({ type: "asset", fileName: ".vite/chunk-modules.json", source: JSON.stringify(modules) });
    },
  };
}

/** Modules up to this size (source bytes, before minifying) are small enough to share a chunk. */
const SMALL_MODULE = 4096;

/**
 * The voyage pages' small modules (Base UI's and HX's helpers, a few hundred bytes each) in two
 * chunks instead of dozens. Left to the default splitting, every set of pages, islands and docs
 * demos that shares a module gets a chunk of its own, so the home page loaded about seventy files
 * under 1 KB gzip, each with its own imports and exports, and a new demo or chapter that shared a
 * helper in a new way split them finer and grew the home page with no new code.
 *
 * The groups are decided from the voyage page's own static imports, so what other pages, islands
 * or demos import doesn't change them: `voyage-docs-shared` holds the small modules the docs page
 * also imports, and `voyage-shared` the rest. Neither takes a module that imports anything outside
 * the groups and the client entry, so loading either chunk loads nothing more, and the docs page
 * loads only the one with modules it already loaded.
 */
export function voyageSmallModules(): Rolldown.CodeSplittingGroup {
  let groups: Map<string, string> | undefined;
  const closure = (root: string, ctx: Rolldown.ChunkingContext) => {
    const seen = new Set<string>();
    const stack = [root];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(ctx.getModuleInfo(id)?.importedIds ?? []));
    }
    return seen;
  };
  const site = (path: string) => fileURLToPath(new URL(path, import.meta.url));
  const assign = (ctx: Rolldown.ChunkingContext) => {
    const page = site("./src/pages/voyage.tsx");
    const shell = closure(site("./src/entry-client.tsx"), ctx);
    const docs = closure(site("./src/pages/docs.tsx"), ctx);
    const small = (module: string) => !/\.css($|\?)/.test(module) && (ctx.getModuleInfo(module)?.code?.length ?? Infinity) <= SMALL_MODULE;
    const candidates = [...closure(page, ctx)].filter((module) => module !== page && !shell.has(module) && small(module));
    const shared = new Set(candidates.filter((module) => docs.has(module)));
    const own = new Set(candidates.filter((module) => !docs.has(module)));
    // Drop, until none is left to drop, a module that imports anything its chunk may not: the
    // docs-shared chunk only itself and the entry, the voyage's own chunk also the docs-shared one.
    const prune = (set: Set<string>, allowed: (dependency: string) => boolean) => {
      for (let changed = true; changed; ) {
        changed = false;
        for (const module of set) {
          if ((ctx.getModuleInfo(module)?.importedIds ?? []).every((dependency) => set.has(dependency) || allowed(dependency))) continue;
          set.delete(module);
          changed = true;
        }
      }
    };
    prune(shared, (dependency) => shell.has(dependency));
    prune(own, (dependency) => shell.has(dependency) || shared.has(dependency));
    return new Map([...[...shared].map((module) => [module, "voyage-docs-shared"] as const), ...[...own].map((module) => [module, "voyage-shared"] as const)]);
  };
  return {
    name: (id, ctx) => (groups ??= assign(ctx)).get(id) ?? null,
    maxModuleSize: SMALL_MODULE,
    includeDependenciesRecursively: false,
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    chunkEvidence(repo),
    proofPlugin(),
    // PROBE (never merged): keep idle connections open longer than any client waits.
    {
      name: "probe-keep-alive",
      configurePreviewServer(server) {
        if (process.env["PROBE_CLOSE"]) {
          server.middlewares.use((_request, response, next) => {
            response.setHeader("Connection", "close");
            next();
          });
          console.log("PROBE connection close");
        }
        if (!process.env["PROBE_KEEPALIVE"]) return;
        const http = server.httpServer as import("node:http").Server;
        http.keepAliveTimeout = 120_000;
        http.headersTimeout = 121_000;
        console.log("PROBE keepAliveTimeout", http.keepAliveTimeout);
      },
    } satisfies Plugin,
  ],
  // `@/` is the repo root, as in the registry source, so the site imports components the
  // way an app's components.json alias does.
  resolve: { alias: { "@": repo } },
  server: { fs: { allow: [repo] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    // Each page's chunk is imported dynamically (site/src/app.tsx), and Vite's preload helper adds a
    // modulepreload link for every chunk it imports, the entry too (it holds React). The entry is
    // already running, and WebKit fetches it again for that link, so the helper leaves it out.
    // The voyage's chapter islands preload nothing: the list of what each imports would sit in the
    // page's first load (about 700 bytes gzip for the four), and an island loads half a screen
    // before it is seen, so its imports can follow it.
    modulePreload: {
      resolveDependencies: (file, deps) => (/(^|\/)(chapter-(one|two|three)|agents)-[\w-]+\.js$/.test(file) ? [] : deps.filter((dep) => !/(^|\/)entry-[\w-]+\.js$/.test(dep))),
    },
    ...(isSsrBuild ? {} : { rollupOptions: { output: { entryFileNames: "assets/entry-[hash].js", codeSplitting: { groups: [voyageSmallModules()] } } } }),
  },
}));
