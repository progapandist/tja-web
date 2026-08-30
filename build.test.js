// What the browser is actually served, checked at every route rather than only
// at "/". Three bugs reached production because I tested the source at the root
// in one browser: a stale app.js paired with fresh HTML, a module resolved
// against /ru/ instead of the root, and a locale rewrite that Cloudflare undid.
// Each of those is a failing case below.
import { expect, test, beforeAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const pages = ["", "en", "ru"].map((dir) => (dir ? `dist/${dir}/index.html` : "dist/index.html"));

beforeAll(() => {
  const built = Bun.spawnSync(["make", "dist"]);
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
});

// href="…", src="…", fetch("…") and import … from "…", minus data: URIs and
// anything pointing off the site.
function urlsIn(text) {
  const found = [...text.matchAll(/(?:href|src)="([^"]+)"|fetch\("([^"]+)"\)|from "([^"]+)"/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((url) => !/^(data:|https?:|mailto:)/.test(url));
  return [...new Set(found)];
}

const assets = (page) => urlsIn(readFileSync(page, "utf8")).filter((url) => url !== "/");

// Cloudflare answers an unknown path with the page itself and a 200, so a
// missing file does not 404 — the browser downloads HTML and tries to run it
// as JavaScript. Nothing surfaces except a spinner that never stops.
test("every asset a page asks for exists at exactly that path", () => {
  for (const page of [...pages, "dist/app.js"]) {
    for (const url of assets(page)) {
      const path = "dist" + url.split("?")[0];
      expect(`${page} → ${url}: ${existsSync(path)}`).toBe(`${page} → ${url}: true`);
    }
  }
});

// A relative URL means something different under /ru/ than it does at the root.
test("no asset URL is relative", () => {
  for (const page of [...pages, "dist/app.js"]) {
    for (const url of assets(page)) {
      expect(`${page} → ${url}`).toBe(`${page} → ${url.startsWith("/") ? url : "/" + url}`);
    }
  }
});

// Without a content hash a browser can keep an old app.js and pair it with new
// HTML, rendering a previous build with no sign anything is wrong.
test("every asset URL carries a content hash", () => {
  for (const page of [...pages, "dist/app.js"]) {
    for (const url of assets(page)) {
      expect(`${page} → ${url}`).toMatch(/\?v=[0-9a-f]{8}$/);
    }
  }
});

// The locale pages are copies. If they ever drift, one of them is stale.
test("the locale pages are identical to the root page", () => {
  const [root, ...rest] = pages.map((page) => readFileSync(page, "utf8"));
  for (const page of rest) expect(page).toBe(root);
});

// The page you get when a file is missing must not itself need a file.
test("the 404 page depends on nothing", () => {
  expect(urlsIn(readFileSync("dist/404.html", "utf8"))).toEqual([]);
});

// index.html decides which translation to fetch before any module loads, so it
// repeats the rule in localeFromPath. The two must not disagree.
test("the inline loader and strings.js agree on the locales", async () => {
  const { locales } = await import("./strings.js");
  const html = readFileSync("dist/index.html", "utf8");

  for (const code of locales.filter((c) => c !== "en")) {
    expect(html).toContain(`=== "${code}"`);
    expect(existsSync(`dist/verbs.${code}.txt`)).toBe(true);
    expect(existsSync(`dist/${code}/index.html`)).toBe(true);
  }
});
