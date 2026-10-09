import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const allowed = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".md"]);
const ignored = new Set([".git", ".next", "dist", "node_modules"]);
const violations = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (allowed.has(extname(entry.name))) {
      const source = await readFile(path, "utf8");
      if (source.includes("\u2014")) violations.push(relative(root, path));
    }
  }
}

await scan(root);
if (violations.length) {
  console.error(`Em dash characters found in: ${violations.join(", ")}`);
  process.exit(1);
}
console.log("Punctuation check passed: no em dash characters found.");
