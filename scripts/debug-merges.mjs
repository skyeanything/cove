import ExcelJS from "exceljs";
import { readFileSync } from "fs";

const buffer = readFileSync("test-sample.xlsx");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);

const sheet = workbook.getWorksheet("Merge Test");
console.log("=== _merges ===");
console.log(JSON.stringify(sheet._merges, null, 2));
console.log("\n=== typeof values ===");
for (const [key, val] of Object.entries(sheet._merges)) {
  console.log(`key="${key}" type=${typeof val} val=`, val);
  if (typeof val === 'object' && val !== null) {
    console.log("  model:", val.model);
    console.log("  range:", val.range);
    console.log("  tl:", val.tl);
    console.log("  br:", val.br);
    console.log("  keys:", Object.keys(val));
  }
}
