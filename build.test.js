// What the browser is actually served, checked at every route rather than only
// at "/". Three bugs reached production because I tested the source at the root
// in one browser: a stale app.js paired with fresh HTML, a module resolved
// against /ru/ instead of the root, and a locale rewrite that Cloudflare undid.
// Each of those is a failing case below, and the head each page carries now
// decides how it gets indexed, so that is pinned here too.
import { expect, test, beforeAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { locales, ui } from "./strings.js";

const SITE = "https://tja.progapanda.org";
const appPath = (code) => (code === "en" ? "/" : `/${code}/`);
const docPath = (code) => (code === "en" ? "/verbs/" : `/${code}/verbs/`);

// The root is English; /en/ is written as well so the path never 404s.
const appPages = ["dist/index.html", ...locales.map((c) => `dist/${c}/index.html`)];
const docPages = ["dist/verbs/index.html", ...locales.map((c) => `dist/${c}/verbs/index.html`)];
const allPages = [...appPages, ...docPages];

const read = (page) => readFileSync(page, "utf8");
const tag = (html, re) => html.match(re)?.[1];

beforeAll(() => {
  const built = Bun.spawnSync(["make", "dist"]);
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
});

// href="…", src="…", fetch("…") and import … from "…", minus data: URIs and
// anything pointing off the site.
function urlsIn(text) {
  const found = [...text.matchAll(/(?:href|src)="([^"]+)"|fetch\("([^"]+)"\)|from "([^"]+)"/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((url) => !/^(data:|https?:|mailto:|#)/.test(url));
  return [...new Set(found)];
}

// A link to another page of the site is not an asset: it has no extension, and
// it resolves to a directory's index.html rather than to a file.
const isAsset = (url) => /\.[a-z0-9]+(\?|$)/i.test(url);
const assets = (page) => urlsIn(read(page)).filter(isAsset);
const pageLinks = (page) => urlsIn(read(page)).filter((url) => !isAsset(url));

// Cloudflare answers an unknown path with the page itself and a 200, so a
// missing file does not 404 — the browser downloads HTML and tries to run it
// as JavaScript. Nothing surfaces except a spinner that never stops.
test("every asset a page asks for exists at exactly that path", () => {
  for (const page of [...allPages, "dist/app.js"]) {
    for (const url of assets(page)) {
      const path = "dist" + url.split("?")[0];
      expect(`${page} → ${url}: ${existsSync(path)}`).toBe(`${page} → ${url}: true`);
    }
  }
});

// A relative URL means something different under /ru/ than it does at the root.
test("no asset URL is relative", () => {
  for (const page of [...allPages, "dist/app.js"]) {
    for (const url of assets(page)) {
      expect(`${page} → ${url}`).toBe(`${page} → ${url.startsWith("/") ? url : "/" + url}`);
    }
  }
});

// Without a content hash a browser can keep an old app.js and pair it with new
// HTML, rendering a previous build with no sign anything is wrong.
test("every asset URL carries a content hash", () => {
  for (const page of [...allPages, "dist/app.js"]) {
    for (const url of assets(page)) {
      expect(`${page} → ${url}`).toMatch(/\?v=[0-9a-f]{8}$/);
    }
  }
});

// Catches a locale that reached the navigation but not the build, or a page
// renamed on one side of a link only.
test("every internal page link resolves to a built page", () => {
  for (const page of allPages) {
    for (const url of pageLinks(page)) {
      const path = `dist${url.split("?")[0]}index.html`;
      expect(`${page} → ${url}: ${existsSync(path)}`).toBe(`${page} → ${url}: true`);
    }
  }
});

// The locale pages come off one template. Their text differs by design now, so
// what gets pinned is the structure: the same elements in the same roles.
test("the locale app pages share their structure", () => {
  const ids = appPages.map((page) =>
    [...read(page).matchAll(/id="([^"]+)"/g)].map((m) => m[1]).sort().join(","),
  );
  for (const set of ids) expect(set).toBe(ids[0]);
});

// The page you get when a file is missing must not itself need a file. A link
// back to the site is fine; a stylesheet or a script is not.
test("the 404 page depends on no assets", () => {
  expect(urlsIn(read("dist/404.html")).filter((url) => url !== "/")).toEqual([]);
});

// index.html decides which translation to fetch before any module loads, so it
// repeats the rule in localeFromPath. The two must not disagree.
test("the inline loader and strings.js agree on the locales", () => {
  const html = read("dist/index.html");
  for (const code of locales.filter((c) => c !== "en")) {
    expect(html).toContain(`${code}: "/verbs.${code}.txt`);
    expect(existsSync(`dist/verbs.${code}.txt`)).toBe(true);
    expect(existsSync(`dist/${code}/index.html`)).toBe(true);
  }
});

// Adding a locale means adding its overlay file in three places. Twice now it
// reached the build but not the cache rules, which serves it revalidating
// forever behind an immutable-looking URL.
test("every locale overlay is served immutable", () => {
  const headers = read("dist/_headers");
  for (const code of locales.filter((c) => c !== "en")) {
    expect(headers).toContain(`/verbs.${code}.txt`);
  }
});

// A browser holds an inline script until every stylesheet above it has loaded,
// so a fetch below the link does not start until the CSS is in. That put the
// largest file on the page behind the stylesheet and cost a visible pause on
// first load, with nothing in the source to show for it.
test("the data fetch starts before the stylesheet blocks it", () => {
  for (const page of appPages) {
    const html = read(page);
    const fetchStarts = html.indexOf('globalThis.verbsText = fetch(');
    const stylesheet = html.indexOf('rel="stylesheet"');
    expect(fetchStarts).toBeGreaterThan(-1);
    expect(`${page}: fetch before stylesheet`).toBe(
      fetchStarts < stylesheet ? `${page}: fetch before stylesheet` : `${page}: fetch AFTER stylesheet`,
    );
  }
});

// ---- what the crawler reads ------------------------------------------------

// Each locale has to declare itself, or a search engine shows the Russian page
// to English readers and folds all three together as one duplicate.
test("every page declares its own language and title", () => {
  for (const code of locales) {
    const app = read(`dist/${code}/index.html`);
    expect(tag(app, /<html lang="([^"]+)"/)).toBe(code);
    expect(tag(app, /<title>([^<]+)<\/title>/)).toBe(ui[code].title);

    const doc = read(`dist/${code}/verbs/index.html`);
    expect(tag(doc, /<html lang="([^"]+)"/)).toBe(code);
    expect(tag(doc, /<title>([^<]+)<\/title>/)).toBe(ui[code].indexTitle);
  }
});

// /en/ and / are the same page. Exactly one of them may claim the ranking.
test("every page points its canonical at the url it wants indexed", () => {
  const canonical = (page) => tag(read(page), /rel="canonical" href="([^"]+)"/);
  expect(canonical("dist/index.html")).toBe(`${SITE}/`);
  expect(canonical("dist/en/index.html")).toBe(`${SITE}/`);
  expect(canonical("dist/verbs/index.html")).toBe(`${SITE}/verbs/`);
  expect(canonical("dist/en/verbs/index.html")).toBe(`${SITE}/verbs/`);
  for (const code of locales.filter((c) => c !== "en")) {
    expect(canonical(`dist/${code}/index.html`)).toBe(SITE + appPath(code));
    expect(canonical(`dist/${code}/verbs/index.html`)).toBe(SITE + docPath(code));
  }
});

// hreflang only counts when every page in the set names every other page and
// itself. A one-way reference is thrown away.
test("the hreflang set is complete on every page", () => {
  for (const [pathFor, group] of [[appPath, appPages], [docPath, docPages]]) {
    for (const page of group) {
      const html = read(page);
      for (const code of locales) {
        const link = `hreflang="${code}" href="${SITE}${pathFor(code)}"`;
        expect(`${page}: ${code}`).toBe(html.includes(link) ? `${page}: ${code}` : `${page}: missing ${code}`);
      }
      expect(html).toContain(`hreflang="x-default" href="${SITE}${pathFor("en")}"`);
    }
  }
});

// A relative og:image is dropped by every scraper that matters, and a card with
// no image is a card nobody clicks.
test("every page carries a social card with an absolute image", () => {
  for (const page of allPages) {
    const html = read(page);
    for (const property of ["og:title", "og:description", "og:url", "og:type", "og:site_name"]) {
      const has = html.includes(`property="${property}"`);
      expect(`${page}: ${property}`).toBe(has ? `${page}: ${property}` : `${page}: missing ${property}`);
    }
    expect(tag(html, /property="og:image" content="([^"]+)"/)).toStartWith(`${SITE}/og.png?v=`);
    expect(tag(html, /name="twitter:card" content="([^"]+)"/)).toBe("summary_large_image");
    expect(tag(html, /name="twitter:image" content="([^"]+)"/)).toStartWith(`${SITE}/og.png?v=`);
  }
  expect(existsSync("dist/og.png")).toBe(true);
});

// Malformed structured data is worse than none: the whole block gets dropped.
test("the structured data on every page is valid JSON", () => {
  for (const page of allPages) {
    const blocks = [...read(page).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(`${page}: ${blocks.length} block(s)`).toBe(`${page}: 1 block(s)`);
    const data = JSON.parse(blocks[0][1]);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@graph"].length).toBeGreaterThan(1);
  }
});

// Two pages with the same title compete against each other for the same query.
test("no two indexed pages share a title or a description", () => {
  const indexed = [
    ...locales.map((c) => (c === "en" ? "dist/index.html" : `dist/${c}/index.html`)),
    ...locales.map((c) => (c === "en" ? "dist/verbs/index.html" : `dist/${c}/verbs/index.html`)),
  ];
  const titles = indexed.map((page) => tag(read(page), /<title>([^<]+)<\/title>/));
  const descriptions = indexed.map((page) => tag(read(page), /name="description" content="([^"]+)"/));
  expect(new Set(titles).size).toBe(indexed.length);
  expect(new Set(descriptions).size).toBe(indexed.length);
  // A description past this gets cut mid-word in the result.
  for (const description of descriptions) expect(description.length).toBeLessThan(320);
});

// Search Console drops the property if this file stops answering, and nothing
// else in the build would notice: it is referenced by no page.
test("the search console verification file ships", () => {
  const token = "googlec2338afcce487655.html";
  expect(existsSync(`dist/${token}`)).toBe(true);
  expect(read(`dist/${token}`)).toContain(`google-site-verification: ${token}`);
});

test("the sitemap lists every indexed page and robots points at it", () => {
  const sitemap = read("dist/sitemap.xml");
  for (const code of locales) {
    expect(sitemap).toContain(`<loc>${SITE}${appPath(code)}</loc>`);
    expect(sitemap).toContain(`<loc>${SITE}${docPath(code)}</loc>`);
  }
  // /en/ duplicates the root, so it must not be offered as its own result.
  expect(sitemap).not.toContain(`<loc>${SITE}/en/</loc>`);
  expect(read("dist/robots.txt")).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});

// The app holds one verb at a time, so the index is the only place a crawler
// can read the collection. If it ever ships short, the site loses its content.
test("the verb index carries every verb and every stem", async () => {
  const { parse } = await import("./data.js");
  const stems = parse(await Bun.file("verbs.txt").text());
  const verbs = stems.flatMap((stem) => stem.verbs);

  for (const code of locales) {
    const html = read(`dist/${code}/verbs/index.html`);
    for (const stem of stems) {
      const has = html.includes(`id="${stem.name}"`);
      expect(`${code}: ${stem.name}`).toBe(has ? `${code}: ${stem.name}` : `${code}: missing ${stem.name}`);
    }
    const links = [...html.matchAll(/\?verb=([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
    expect(`${code}: ${links.length} links`).toBe(`${code}: ${verbs.length} links`);
  }
});
