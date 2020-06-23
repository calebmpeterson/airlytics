require("regenerator-runtime/runtime");
require("dotenv").config();

const walk = require("klaw-sync");

if (process.env.NODE_ENV !== "development") {
  const paths = walk("./");
  paths.forEach(({ path }) => console.log(path));
}
