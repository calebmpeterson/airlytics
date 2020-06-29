const fs = require("fs");
const showdown = require("showdown");

const converter = new showdown.Converter();
converter.setOption("tasklists", true);

const text = fs.readFileSync("./README.md", "UTF-8");
const template = fs.readFileSync("./docs/_template.html", "UTF-8");

const content = converter.makeHtml(text);
const html = template.replace("{{content}}", content);

fs.writeFileSync("./docs/index.html", html, "UTF-8");
