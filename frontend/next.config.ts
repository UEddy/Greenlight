import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // greenlight-backend is a workspace package that exports TypeScript source
  // rather than a build output, so there is no compiled copy able to drift
  // from what the tests run against. Next compiles it as part of this app.
  transpilePackages: ["greenlight-backend"],
  // The fixtures live in the sibling backend package and are read from disk by
  // a server component, so the tracing root has to include the repo root.
  // fileURLToPath, not URL.pathname: the latter yields "/C:/..." on Windows,
  // which is not a path any OS will canonicalize.
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
};

export default nextConfig;
