const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const devDir = path.join(process.cwd(), ".next", "dev");

fs.mkdirSync(devDir, { recursive: true });

const routesManifestPath = path.join(devDir, "routes-manifest.json");
const prerenderManifestPath = path.join(devDir, "prerender-manifest.json");

if (!fs.existsSync(routesManifestPath)) {
  fs.writeFileSync(
    routesManifestPath,
    JSON.stringify({
      version: 3,
      caseSensitive: false,
      basePath: "",
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      redirects: [
        {
          source: "/:path+/",
          destination: "/:path+",
          permanent: true,
          internal: true,
          priority: true,
          regex: "^(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))\\/$",
        },
      ],
      headers: [],
      onMatchHeaders: [],
    }),
  );
}

if (!fs.existsSync(prerenderManifestPath)) {
  fs.writeFileSync(
    prerenderManifestPath,
    JSON.stringify(
      {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: {
          previewModeId: crypto.randomBytes(16).toString("hex"),
          previewModeSigningKey: crypto.randomBytes(32).toString("hex"),
          previewModeEncryptionKey: crypto.randomBytes(32).toString("hex"),
        },
      },
      null,
      2,
    ),
  );
}
