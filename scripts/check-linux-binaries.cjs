#!/usr/bin/env node
/**
 * Checks that every platform specific binary the frontend needs on Linux is
 * recorded in the lockfile.
 *
 * Why this exists. npm records only the native binary matching the machine
 * that ran the install, so a lockfile generated on Windows produces a Linux
 * build with nothing to load. That failure appears one package at a time, at
 * whichever build stage first touches it: lightningcss at the first CSS file,
 * then oxide, then typescript at the type check. Finding them by deploying
 * costs a deploy each. This finds all of them at once, locally, in a second.
 *
 * It walks the frontend's dependency closure, including devDependencies
 * because the build type checks and runs Tailwind, and reports any optional
 * dependency constrained to linux x64 that has no entry in the tree.
 *
 *   node scripts/check-linux-binaries.cjs
 *
 * Exits non zero when something is missing, so it can gate a release.
 */

const { join } = require("node:path");
const lock = require(join(__dirname, "..", "package-lock.json"));
const pkgs = lock.packages;

/** Node resolution over lockfile keys: walk up the node_modules chain. */
function resolveFrom(loc, name) {
  const bases = [];
  let base = loc;
  for (;;) {
    bases.push(base);
    const i = base.lastIndexOf("/node_modules/");
    if (i === -1) break;
    base = base.slice(0, i);
  }
  // A root level package such as node_modules/x has no "/node_modules/" to
  // strip, so the root itself has to be appended explicitly.
  bases.push("");
  for (const b of bases) {
    const key = (b ? b + "/" : "") + "node_modules/" + name;
    if (pkgs[key]) return key;
  }
  return null;
}

const closure = new Map();
(function walk(key) {
  if (closure.has(key)) return;
  const p = pkgs[key];
  if (!p) return;
  closure.set(key, p);
  const deps = {
    ...(p.dependencies || {}),
    ...(p.devDependencies || {}),
    ...(p.optionalDependencies || {}),
  };
  for (const name of Object.keys(deps)) {
    const target = resolveFrom(key, name);
    if (target) walk(target);
  }
})("frontend");

// Linux x64 only. That is what Vercel builds on. An arm64 or musl builder
// would need its own pass, which is a deliberate limit rather than an
// oversight, and it is written down in the README.
const IS_LINUX_X64 = /linux/i;
const NOT_OURS = /musl|arm|android|darwin|freebsd|win32|wasm|openharmony|s390|ppc|riscv|loong|mips/i;

const missing = [];
let checked = 0;
for (const [key, p] of closure) {
  for (const [dep, version] of Object.entries(p.optionalDependencies || {})) {
    if (!IS_LINUX_X64.test(dep) || NOT_OURS.test(dep)) continue;
    checked += 1;
    if (!resolveFrom(key, dep)) {
      missing.push({ dep, version, parent: key, parentVersion: p.version });
    }
  }
}

console.log(`frontend closure: ${closure.size} packages, ${checked} linux x64 binaries required`);

if (missing.length === 0) {
  console.log("every linux x64 binary the frontend needs is in the lockfile");
  process.exit(0);
}

console.error("\nMissing from the lockfile, so a Linux build will fail on each:");
for (const m of missing) {
  console.error(`  ${m.dep}@${m.version}`);
  console.error(`      required by ${m.parent} (${m.parentVersion})`);
}
console.error(
  "\nAdd each to optionalDependencies in frontend/package.json at exactly the\n" +
    "version shown, which is the one the frontend's own copy of the parent asks\n" +
    "for, then run npm install at the repo root.",
);
process.exit(1);
