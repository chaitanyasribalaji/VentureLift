import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");

mkdirSync(PUBLIC, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  copyFileSync(resolve(ROOT, file), resolve(PUBLIC, file));
}

console.log("Static assets successfully built to public/");
