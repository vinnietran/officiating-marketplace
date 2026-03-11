import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const buildDir = path.resolve(".test-build");

function runOrExit(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function collectTestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTestFiles(fullPath);
      }
      return entry.name.endsWith(".test.js") ? [fullPath] : [];
    })
  );

  return files.flat().sort();
}

async function main() {
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(
    path.join(buildDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2),
    "utf8"
  );

  runOrExit("npx", ["tsc", "-p", "tsconfig.tests.json"]);

  const testFiles = await collectTestFiles(path.join(buildDir, "tests"));
  if (testFiles.length === 0) {
    throw new Error("No compiled app tests were found.");
  }

  runOrExit(process.execPath, ["--test", "--experimental-test-coverage", ...testFiles]);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

