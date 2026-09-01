const fs = require("fs");
const parser = require("@babel/parser");

const file = process.argv[2];
const isTsx = file.endsWith(".tsx");
const code = fs.readFileSync(file, "utf8");

try {
  parser.parse(code, {
    sourceType: "module",
    plugins: isTsx ? ["typescript", "jsx"] : ["typescript"],
  });
  console.log("OK:", file);
} catch (err) {
  console.error("SYNTAX ERROR in", file);
  console.error(err.message);
  process.exit(1);
}