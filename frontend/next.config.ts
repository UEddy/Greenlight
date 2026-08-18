import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The fixtures live in the sibling backend package and are read from disk by
  // a server component, so the tracing root has to include the repo root.
  // fileURLToPath, not URL.pathname: the latter yields "/C:/..." on Windows,
  // which is not a path any OS will canonicalize.
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
};

export default nextConfig;
