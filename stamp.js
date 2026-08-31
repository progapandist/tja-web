// The build. Two jobs, in order.
//
// First it puts a content hash on every asset URL in dist/, so a browser can
// never pair a fresh index.html with a stale app.js. The filenames stay as they
// are; only the URLs the page asks for carry the hash, which is enough to
// defeat any cache and lets the assets be served immutable.
//
// Then it writes the pages: one app page per locale and one verb index per
// locale, each with its own title, canonical, hreflang set and social card,
// plus the sitemap. The app is a JS-rendered screen that only ever holds one
// verb, so the verb index is what gives a crawler the whole collection to read.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse, prefixOf, forms, collate, translate, assignIds } from "./data.js";
import { locales, ui } from "./strings.js";

const SITE = "https://tja.progapanda.org";
const OG_LOCALE = { en: "en_US", ru: "ru_RU", fr: "fr_FR" };
// DNS for this domain sits at DigitalOcean, not on Cloudflare's nameservers,
// so the dashboard's automatic zone-wide injection isn't available — this is
// the manual beacon instead, on every page except 404.html, which is kept
// deliberately free of any asset it could fail to load.
const ANALYTICS =
  '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "d95cf5310079475895877b0ef5dfb567"}\'></script>';
const dist = "dist/";
const hash = (file) => createHash("md5").update(readFileSync(dist + file)).digest("hex").slice(0, 8);

// The one place these get counted. A translation overlay only replaces text
// fields, never adds or drops a verb, so the count is the same in every
// locale and comes from the German source rather than from any of them.
const BASE_STEMS = parse(readFileSync("verbs.txt", "utf8"));
const VERB_COUNT = BASE_STEMS.reduce((n, stem) => n + stem.verbs.length, 0);
const STEM_COUNT = BASE_STEMS.length;

// A replacement that fails the build instead of silently doing nothing. Every
// substitution below leans on an exact string in index.html that someone could
// reword, and a quiet no-op would ship /ru/ with an English title.
function must(text, needle, replacement) {
  if (!text.includes(needle)) throw new Error(`stamp: nothing to replace for ${JSON.stringify(needle)}`);
  return text.replace(needle, replacement);
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---- asset hashes ----------------------------------------------------------
const overlays = locales.filter((code) => code !== "en").map((code) => `verbs.${code}.txt`);
const stamped = {};

// The leaves first: app.js imports data.js and strings.js, so its own hash only
// settles once their URLs are written into it.
for (const file of ["data.js", "strings.js", "style.css", "og.png", "verbs.txt", ...overlays]) {
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
for (const file of ["verbs.txt", ...overlays]) {
  app = app.replaceAll(`"/${file}"`, `"/${stamped[file]}"`);
}
writeFileSync(dist + "app.js", app);
stamped["app.js"] = `app.js?v=${hash("app.js")}`;

let template = readFileSync(dist + "index.html", "utf8");
for (const [file, versioned] of Object.entries(stamped)) {
  template = template.replaceAll(`"${file}"`, `"/${versioned}"`).replaceAll(`"/${file}"`, `"/${versioned}"`);
}

// ---- urls ------------------------------------------------------------------
// English lives at the root. /en/ is written too so the path never 404s, but it
// points its canonical at the root and stays out of the sitemap rather than
// competing with it for the same words.
const appPath = (code) => (code === "en" ? "/" : `/${code}/`);
const docPath = (code) => (code === "en" ? "/verbs/" : `/${code}/verbs/`);

const alternates = (pathFor) =>
  [
    ...locales.map((code) => `<link rel="alternate" hreflang="${code}" href="${SITE}${pathFor(code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pathFor("en")}">`,
  ].join("\n");

// ---- the head --------------------------------------------------------------
function head({ code, canonical, title, description, keywords, pathFor, jsonld }) {
  const image = `${SITE}/${stamped["og.png"]}`;
  const alt = ui[code].title;
  return [
    `<link rel="canonical" href="${canonical}">`,
    alternates(pathFor),
    `<meta name="keywords" content="${escape(keywords)}">`,
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">`,
    `<meta name="author" content="progapandist">`,
    // Open Graph, which Facebook, LinkedIn, Slack, WhatsApp and Telegram read.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="tja">`,
    `<meta property="og:locale" content="${OG_LOCALE[code]}">`,
    ...locales
      .filter((other) => other !== code)
      .map((other) => `<meta property="og:locale:alternate" content="${OG_LOCALE[other]}">`),
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:alt" content="${escape(alt)}">`,
    // X reads its own names and falls back to og: for everything else.
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escape(title)}">`,
    `<meta name="twitter:description" content="${escape(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${escape(alt)}">`,
    `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
  ].join("\n");
}

// ---- the app pages ---------------------------------------------------------
function appPage(code) {
  const t = ui[code];
  const canonical = SITE + appPath(code);
  const description = t.description(VERB_COUNT, STEM_COUNT);
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: `${SITE}/`,
        name: "tja",
        description,
        inLanguage: t.lang,
      },
      {
        "@type": ["WebApplication", "LearningResource"],
        "@id": `${canonical}#app`,
        name: "tja",
        url: canonical,
        isPartOf: { "@id": `${SITE}/#website` },
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any web browser",
        browserRequirements: "Requires JavaScript",
        inLanguage: t.lang,
        description,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        learningResourceType: "flashcards",
        educationalLevel: "A1, A2, B1, B2, C1",
        teaches:
          "German prefix verbs: separability, conjugation in Präsens, Präteritum and Perfekt, rection, and verb position in the Nebensatz",
        about: { "@type": "Thing", name: "German prefix verbs" },
      },
    ],
  };

  let page = template;
  page = must(page, '<html lang="en">', `<html lang="${t.lang}">`);
  page = must(page, "<title>tja — German prefix verbs</title>", `<title>${escape(t.title)}</title>`);
  page = must(
    page,
    '<meta name="description" content="German prefix verbs as a one-armed bandit: two reels, prefixes and stems, that filter each other.">',
    `<meta name="description" content="${escape(description)}">`,
  );
  page = must(
    page,
    "<!--seo-->",
    head({ code, canonical, title: t.title, description, keywords: t.keywords, pathFor: appPath, jsonld }),
  );
  page = must(page, "<!--analytics-->", ANALYTICS);
  // The crawler reads this static link; app.js writes the same one at runtime.
  page = must(
    page,
    '<a class="contrib" id="all-verbs" href="/verbs/">all verbs</a>',
    `<a class="contrib" id="all-verbs" href="${docPath(code)}">${escape(t.allVerbs)}</a>`,
  );
  return page;
}

// ---- the verb index --------------------------------------------------------
function stemsFor(code) {
  const stems = parse(readFileSync("verbs.txt", "utf8")).sort((a, b) => collate(a.name, b.name));
  if (code !== "en") translate(stems, readFileSync(`verbs.${code}.txt`, "utf8"));
  // Same parse → sort → flatMap sequence app.js runs, so a homograph gets the
  // same id here as it does in the app the link points at.
  assignIds(stems.flatMap((stem) => stem.verbs));
  return stems;
}

function docPage(code) {
  const t = ui[code];
  const canonical = SITE + docPath(code);
  const stems = stemsFor(code);
  const indexTitle = t.indexTitle(VERB_COUNT);

  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: indexTitle,
        description: t.indexDescription,
        inLanguage: t.lang,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Thing", name: "German prefix verbs" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "tja", item: SITE + appPath(code) },
          { "@type": "ListItem", position: 2, name: t.indexHeading, item: canonical },
        ],
      },
    ],
  };

  const jump = stems
    .map((stem) => `<a href="#${escape(stem.name)}" lang="de">${escape(stem.name)}</a>`)
    .join("");

  const sections = stems
    .map((stem) => {
      const rows = stem.verbs
        .map((verb) => {
          const prefix = prefixOf(verb);
          const { present, past, perfect } = forms(verb);
          const kind = !prefix ? t.base : verb.sep ? t.separable : t.inseparable;
          // Same stressed-half bolding as the card: a separable prefix carries
          // the stress, an inseparable one never does.
          const name = !prefix
            ? escape(verb.stem.name)
            : verb.sep
              ? `<b class="sep">${escape(prefix)}</b>${escape(verb.stem.name)}`
              : `${escape(prefix)}<b class="insep">${escape(verb.stem.name)}</b>`;
          return `      <li>
        <a class="v" lang="de" href="${appPath(code)}?verb=${encodeURIComponent(verb.id)}">${name}</a>
        <span class="m">${escape(verb.official)}</span>
        <span class="k ${!prefix ? "bare" : verb.sep ? "sep" : "insep"}">${escape(kind)}</span>
        <span class="f" lang="de">er/sie ${escape(present)} · ${escape(past)} · ${escape(perfect)}</span>
      </li>`;
        })
        .join("\n");
      return `    <section>
      <h3 id="${escape(stem.name)}"><span lang="de">${escape(stem.name)}</span> <i>${escape(stem.gloss)}</i></h3>
      <ul>
${rows}
      </ul>
    </section>`;
    })
    .join("\n");

  const localeNav = locales
    .map((other) => {
      const on = other === code ? ' class="on" aria-current="true"' : "";
      return `<a${on} href="${docPath(other)}">${other.toUpperCase()}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="description" content="${escape(t.indexDescription)}">
<title>${escape(indexTitle)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>🎰</text></svg>">
<script>
  // Same pre-paint theme read as the app, so moving between them never flashes.
  try {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (e) {}
</script>
<link rel="stylesheet" href="/${stamped["style.css"]}">
${head({ code, canonical, title: indexTitle, description: t.indexDescription, keywords: t.keywords, pathFor: docPath, jsonld })}
${ANALYTICS}
</head>
<body class="doc">
<header>
  <h1><a href="${appPath(code)}"><span class="marks" aria-hidden="true"><i class="circle"></i><i class="triangle"></i><i class="square"></i></span>tja</a></h1>
  <nav class="locale" aria-label="${escape(t.languageLabel)}">${localeNav}</nav>
  <a class="contrib" href="${appPath(code)}">${escape(t.backToApp)}</a>
</header>

<main>
  <h2 class="doc-title">${escape(t.indexHeading)}</h2>
  <p class="doc-intro">${escape(t.indexIntro(VERB_COUNT, STEM_COUNT))}</p>
  <p class="doc-count">${escape(t.count(VERB_COUNT))} · ${escape(t.stemsHeading(STEM_COUNT))}</p>
  <nav class="jump" aria-label="${escape(t.stemsLabel)}">${jump}</nav>
${sections}
</main>

<footer class="doc-foot">
  <a href="${appPath(code)}">${escape(t.backToApp)}</a>
  <a href="https://github.com/progapandist/tja-web" target="_blank" rel="noopener">${escape(t.contribute)}</a>
</footer>
</body>
</html>
`;
}

// ---- write -----------------------------------------------------------------
// The root is English; every locale also gets its own directory, /en/ included,
// so no path 404s and the canonical sorts out which one ranks.
for (const code of [...locales, "root"]) {
  const dir = code === "root" ? dist : `${dist}${code}/`;
  const which = code === "root" ? "en" : code;
  mkdirSync(dir + "verbs/", { recursive: true });
  writeFileSync(dir + "index.html", appPage(which));
  writeFileSync(dir + "verbs/index.html", docPage(which));
}

const today = new Date().toISOString().slice(0, 10);
const urls = locales.flatMap((code) => [
  { loc: SITE + appPath(code), pathFor: appPath, priority: code === "en" ? "1.0" : "0.9" },
  { loc: SITE + docPath(code), pathFor: docPath, priority: "0.8" },
]);
writeFileSync(
  dist + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    ({ loc, pathFor, priority }) => `  <url>
    <loc>${loc}</loc>
${locales.map((c) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${SITE}${pathFor(c)}"/>`).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pathFor("en")}"/>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`,
);

console.log(Object.values(stamped).join("  "));
console.log(`pages: ${locales.length + 1} app, ${locales.length + 1} index · sitemap: ${urls.length} urls`);
