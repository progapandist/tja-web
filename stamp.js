// Puts a content hash on every asset URL in dist/, so a browser can never pair
// a fresh index.html with a stale app.js. The filenames stay as they are; only
// the URLs the page asks for carry the hash, which is enough to defeat any
// cache and lets the assets be served immutable.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const dist = "dist/";
const hash = (file) => createHash("md5").update(readFileSync(dist + file)).digest("hex").slice(0, 8);

const stamped = {};

// The leaves first: app.js imports data.js and strings.js, so its own hash
// only settles once their URLs are written into it.
for (const file of ["data.js", "strings.js", "style.css", "verbs.txt", "verbs.ru.txt", "verbs.fr.txt"]) {
  stamped[file] = `${file}?v=${hash(file)}`;
}

// Absolute, not relative: /ru/ is a real directory as far as the browser is
// concerned, and a relative specifier there resolves to /ru/data.js, which
// Cloudflare answers with the HTML page instead of a 404.
let app = readFileSync(dist + "app.js", "utf8");
for (const file of ["data.js", "strings.js"]) {
  app = app.replaceAll(`"./${file}"`, `"/${stamped[file]}"`);
}
// The data fetch inside app.js is a fallback for when index.html has not
// started it, but an unversioned URL served immutable would pin a stale copy
// for a year, so it gets a hash like everything else.
for (const file of ["verbs.txt", "verbs.ru.txt", "verbs.fr.txt"]) {
  app = app.replaceAll(`"/${file}"`, `"/${stamped[file]}"`);
}
writeFileSync(dist + "app.js", app);
stamped["app.js"] = `app.js?v=${hash("app.js")}`;

let html = readFileSync(dist + "index.html", "utf8");
for (const [file, versioned] of Object.entries(stamped)) {
  html = html.replaceAll(`"${file}"`, `"/${versioned}"`).replaceAll(`"/${file}"`, `"/${versioned}"`);
}
writeFileSync(dist + "index.html", html);

console.log(Object.values(stamped).join("  "));
