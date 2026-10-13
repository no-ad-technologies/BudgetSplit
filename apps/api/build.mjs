// Bundles the API into dist/server.js for the Docker image.
// Our own code and @budgetsplit/* workspace packages are bundled; every other npm package
// stays external and is loaded from node_modules at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-npm-packages",
      setup(b) {
        // Bare specifiers ("express", "@prisma/client/...") are npm packages: keep them external.
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith("@budgetsplit/") ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
