import fs from "node:fs/promises";
import path from "node:path";

import { renderEmailHtml, renderEmailText } from "./render.mjs";
import { createSampleReport } from "./sample-report.mjs";

async function main() {
  const outputDir = path.resolve("docs/weekly-product-update-example");
  const report = createSampleReport();
  const html = renderEmailHtml(report);
  const text = renderEmailText(report);

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "weekly-product-update-example.html"), html, "utf8"),
    fs.writeFile(path.join(outputDir, "weekly-product-update-example.txt"), text, "utf8"),
    fs.writeFile(
      path.join(outputDir, "weekly-product-update-example.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    ),
  ]);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
