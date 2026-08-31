import { expect, test, beforeAll } from "bun:test";
import { JSDOM } from "jsdom";
import { parse, forms, nebensatz, search, translate, collate, assignIds } from "./data.js";

const raw = await Bun.file("verbs.txt").text();
const stems = parse(raw);
const verbs = stems.flatMap((s) => s.verbs);
const find = (name) => verbs.find((v) => v.name === name);

test("the flat file parses into stems and their verbs", () => {
  expect(stems.length).toBeGreaterThan(80);
  expect(verbs.length).toBeGreaterThan(700);
  expect(verbs.every((v) => v.name.endsWith(v.stem.name))).toBe(true);
  expect(verbs.every((v) => v.official && v.example && v.english && v.use)).toBe(true);
});

// Where a prefix goes is the whole point of the app, so the three cases that
// place it differently each get pinned down.
test("forms move the prefix the way German does", () => {
  expect(forms(find("nehmen"))).toEqual({ present: "nimmt", past: "nahm", perfect: "hat genommen" });
  expect(forms(find("annehmen"))).toEqual({ present: "nimmt … an", past: "nahm … an", perfect: "hat angenommen" });
  expect(forms(find("übernehmen"))).toEqual({ present: "übernimmt", past: "übernahm", perfect: "hat übernommen" });
  // A separable prefix rejoins its stem when the verb goes last.
  expect(nebensatz(find("annehmen"))).toBe("…, weil sie es annimmt.");
  expect(nebensatz(find("teilnehmen"))).toBe("…, weil sie daran teilnimmt.");
});

// The clause is generated from the rection, and a verb that governs a
// preposition has to keep it. Reading the pattern by searching for a token
// anywhere inside it dropped the preposition ("mit jdm+D" came out as a bare
// "mir") and picked the wrong object when two slots were listed.
test("the generated clause keeps the preposition the verb governs", () => {
  const clause = (name) => nebensatz(find(name));

  // A person keeps the preposition and takes a pronoun.
  expect(clause("mitkommen")).toBe("…, weil sie mit mir mitkommt."); // mit jdm+D
  expect(clause("vorbeischauen")).toBe("…, weil sie bei mir vorbeischaut."); // bei jdm+D
  expect(clause("zukommen")).toBe("…, weil sie auf mich zukommt."); // auf jdn+A
  expect(clause("einspringen")).toBe("…, weil sie für mich einspringt."); // für jdn+A

  // A thing takes the da- compound, because German has no "mit es".
  expect(clause("auskommen")).toBe("…, weil sie damit auskommt."); // mit etw/jdm+D
  expect(clause("nachdenken")).toBe("…, weil sie darüber nachdenkt."); // über etw+A
  expect(clause("verstoßen")).toBe("…, weil sie dagegen verstößt."); // gegen etw+A
  expect(clause("abhängen")).toBe("…, weil sie davon abhängt."); // von jdm/etw+D

  // The first slot in the pattern is the object, not the first one that
  // happens to match: besprechen is "etw+A mit jdm+D", so it is "es".
  expect(clause("besprechen")).toBe("…, weil sie es bespricht.");
  expect(clause("weitergeben")).toBe("…, weil sie es weitergibt."); // etw+A an jdn+A

  // A dative person plus an accusative thing takes both.
  expect(clause("geben")).toBe("…, weil sie mir das gibt."); // jdm etw+A
  expect(clause("vornehmen")).toBe("…, weil sie sich das vornimmt."); // sich+D etw+A

  // Nothing to stand in for leaves the clause bare rather than inventing one.
  expect(clause("zunehmen")).toBe("…, weil sie zunimmt."); // kein Obj.
  expect(clause("gedenken")).toBe("…, weil sie gedenkt."); // genitive

  // Every verb produces a clause, and none leaks the rection notation into it.
  for (const verb of verbs) {
    expect(`${verb.name}: ${nebensatz(verb)}`).not.toMatch(/jdm|jdn|jds|etw|\+[ADG]|·/);
  }
});

// The two umfahren senses are written identically in a Nebensatz and differ
// only in stress. That is the one place the pair collapses, and it should.
test("the umfahren pair reads alike in a Nebensatz", () => {
  const both = verbs.filter((v) => v.name === "umfahren");
  expect(both.length).toBe(2);
  expect(nebensatz(both[0])).toBe(nebensatz(both[1]));
});

// The reader searches in whatever language the card is in, so the meaning text
// has to be reachable, ranked, and forgiving about ё and about phrases.
test("search reaches the meaning, not just the German", async () => {
  // Sorted the way app.js sorts it, or the ranking under test is not the
  // ranking the reader gets.
  const ru = translate(parse(raw), await Bun.file("verbs.ru.txt").text())
    .sort((a, b) => collate(a.name, b.name))
    .flatMap((stem) => stem.verbs);
  const names = (q) => search(ru, q).map((v) => v.name);

  // A word the entry opens with outranks the same word buried in a sentence.
  const принимать = names("принимать");
  expect(принимать).toContain("annehmen");
  expect(принимать.indexOf("annehmen")).toBeLessThan(принимать.indexOf("einnehmen"));
  expect(names("сдать экзамен")).toContain("bestehen"); // every word, not the phrase
  expect(names("повезёт")).toEqual(names("повезет")); // ё and е are the same key
  expect(names("xyzzy")).toEqual([]);

  // German still finds German, whichever language the card is in.
  expect(names("annehm")[0]).toBe("annehmen");
});

// Same shape as the Russian search test above, over the French overlay.
test("search reaches the meaning in French too", async () => {
  const fr = translate(parse(raw), await Bun.file("verbs.fr.txt").text())
    .sort((a, b) => collate(a.name, b.name))
    .flatMap((stem) => stem.verbs);
  const names = (q) => search(fr, q).map((v) => v.name);

  const accepter = names("accepter");
  expect(accepter).toContain("annehmen");
  expect(accepter[0]).toBe("annehmen"); // the entry that opens with the word
  expect(names("réussir un examen")).toContain("bestehen"); // every word, not the phrase
  expect(names("xyzzy")).toEqual([]);
});

test("search ignores umlauts, spelled either way", () => {
  const names = (q) => search(verbs, q).map((v) => v.name);
  expect(names("ubernehm")[0]).toBe("übernehmen");
  expect(names("uebernehm")[0]).toBe("übernehmen");
  expect(names("mitneh")[0]).toBe("mitnehmen"); // a query spanning prefix and stem
  expect(names("lift")).toContain("mitnehmen"); // and meanings count too
  expect(names("xqzz")).toEqual([]);
});

// Every verb and stem has a Russian counterpart, including the two names that
// appear twice: übersetzen and umgehen are each a separable and an inseparable
// verb spelled the same way, and they must not swap translations.
test("the Russian layer covers the data and keeps the homographs apart", async () => {
  const ru = await Bun.file("verbs.ru.txt").text();
  const translated = translate(parse(raw), ru);
  const all = translated.flatMap((stem) => stem.verbs);

  expect(translated.every((stem) => /[а-яё]/i.test(stem.gloss))).toBe(true);
  const untranslated = all.filter((verb) => !/[а-яё]/i.test(verb.official));
  expect(untranslated.map((verb) => verb.name)).toEqual([]);
  expect(all.every((verb) => /[а-яё]/i.test(verb.english))).toBe(true);

  const [textual, ferry] = all.filter((verb) => verb.name === "übersetzen");
  expect(textual.official).toContain("переводить");
  expect(ferry.official).toContain("переправ");
});

// Same shape as the Russian test above, over the French overlay: every entry
// gets its own line and the two übersetzen homographs don't swap meanings.
test("the French layer covers the data and keeps the homographs apart", async () => {
  const fr = await Bun.file("verbs.fr.txt").text();
  const english = parse(raw).flatMap((stem) => stem.verbs);
  const translated = translate(parse(raw), fr).flatMap((stem) => stem.verbs);

  expect(translated.every((verb, i) => verb.official !== english[i].official)).toBe(true);
  expect(translated.every((verb) => verb.official && verb.colloquial && verb.english)).toBe(true);

  const [textual, ferry] = translated.filter((verb) => verb.name === "übersetzen");
  expect(textual.official).toContain("traduire");
  expect(ferry.official).toContain("traverser");
});

// The id is what a URL and a lookup actually address a verb by. Only a name
// that collides should ever need one beyond its own spelling.
test("assignIds only touches names that actually collide", () => {
  const withIds = assignIds(parse(raw).flatMap((s) => s.verbs));
  const count = new Map();
  for (const v of withIds) count.set(v.name, (count.get(v.name) ?? 0) + 1);
  const colliding = new Set([...count].filter(([, n]) => n > 1).map(([name]) => name));

  // The pairs German actually has: one spelling, both separabilities, two
  // meanings. A name landing here by accident is a data entry mistake.
  expect([...colliding].sort()).toEqual(["umfahren", "umgehen", "überfahren", "übersetzen"].sort());

  const solo = withIds.filter((v) => !colliding.has(v.name));
  expect(solo.every((v) => v.id === v.name)).toBe(true);

  for (const name of colliding) {
    const pair = withIds.filter((v) => v.name === name);
    expect(pair.map((v) => v.id)).toEqual([name, `${name}-2`]);
    // One of each separability. Two rows of the same kind would be a duplicate,
    // not a homograph.
    expect(new Set(pair.map((v) => v.sep)).size).toBe(2);
  }
  expect(new Set(withIds.map((v) => v.id)).size).toBe(withIds.length); // every id unique
});

// A German class says Präteritum, not "past" — the terms name German
// categories and translating them teaches the wrong word.
test("the grammar terms stay German in every locale", async () => {
  const { ui, locales } = await import("./strings.js");
  for (const locale of locales) {
    expect(ui[locale].present).toBe("Präsens");
    expect(ui[locale].past).toBe("Präteritum");
    expect(ui[locale].perfect).toBe("Perfekt");
    expect(ui[locale].subclause).toBe("Nebensatz");
    expect(ui[locale].separable).toBe("trennbar");
    expect(ui[locale].inseparable).toBe("untrennbar");
  }
});

// ---- the app, mounted in a DOM ----
let win;
let app;

beforeAll(async () => {
  const html = (await Bun.file("index.html").text()).replace(/<script[\s\S]*?<\/script>/g, "");
  win = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true }).window;
  win.Element.prototype.animate = () => ({}); // jsdom has no Web Animations
  win.Element.prototype.scrollIntoView = () => {};
  win.matchMedia = () => ({ matches: false, addEventListener() {} }); // jsdom has no matchMedia either
  Object.assign(globalThis, {
    document: win.document,
    addEventListener: win.addEventListener.bind(win),
    matchMedia: win.matchMedia,
    localStorage: win.localStorage,
    fetch: async () => new Response(raw),
  });
  app = await import("./app.js");
});

const items = (id) => [...win.document.querySelectorAll(`#${id} .item`)];
// Browse mode draws the list once; test mode stacks three copies for the roll.
const copies = () => (win.document.body.classList.contains("testing") ? 3 : 1);
const shown = (id) => items(id).slice(0, items(id).length / copies()).map((i) => i.textContent);
const word = () => win.document.querySelector(".word").textContent;

// Each reel is filtered against what the other one is showing, so anything you
// can land on next to the current selection is a word.
test("the reels only offer combinations that are real words", () => {
  const names = new Set(verbs.map((v) => v.name));
  const at = (id) => win.document.querySelector(`#${id} .item.on`).textContent;
  const prefix = at("prefix") === "—" ? "" : at("prefix");
  const stem = at("stem");
  for (const p of shown("prefix")) expect(names.has((p === "—" ? "" : p) + stem)).toBe(true);
  for (const s of shown("stem")) expect(names.has(prefix + s)).toBe(true);
});

test("picking on one reel drags the other to something that pairs", () => {
  const names = new Set(verbs.map((v) => v.name));
  for (const label of shown("prefix").slice(0, 6)) {
    const item = [...win.document.querySelectorAll("#prefix .item")].find((i) => i.textContent === label);
    item.click();
    expect(names.has(word())).toBe(true);
  }
  for (const label of shown("stem").slice(0, 6)) {
    const item = [...win.document.querySelectorAll("#stem .item")].find((i) => i.textContent === label);
    item.click();
    expect(names.has(word())).toBe(true);
  }
});

// umgehen is spelled one way and is two different verbs: separable "to deal
// with", inseparable "to circumvent". Selecting prefix+stem used to resolve
// by name alone, which could only ever return one of them — this is the
// reachability bug that fix is pinned against.
test("both umgehen verbs are reachable, and stay distinct", () => {
  const query = win.document.querySelector("#q");
  query.value = "umgehen";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
  const hits = [...win.document.querySelectorAll("#hits li")];
  expect(hits.length).toBe(2);
  hits[0].click();
  expect(word()).toBe("umgehen");

  // The prefix reel shows "um" twice for this stem — one row per sense,
  // coloured the same red (trennbar) / blue (untrennbar) as the badge.
  const umItems = [...win.document.querySelectorAll("#prefix .item")].filter((i) => i.textContent === "um");
  expect(umItems.length).toBe(2);
  expect(umItems.some((i) => i.classList.contains("sep"))).toBe(true);
  expect(umItems.some((i) => i.classList.contains("insep"))).toBe(true);

  const gloss = () => win.document.querySelector(".gloss").textContent;
  umItems[0].click();
  const glossA = gloss();
  expect(word()).toBe("umgehen"); // still the same word
  umItems[1].click();
  const glossB = gloss();
  expect(word()).toBe("umgehen");
  expect(new Set([glossA, glossB])).toEqual(
    new Set(["to circumvent, to get around (a rule)", "to deal with, to handle (mit +D)"]),
  );

  query.value = "";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
});

// The locale picker carries the current verb in a URL param — it has to name
// which of the two übersetzen senses is on screen, not just the spelling.
test("the locale link's verb id tells the two übersetzen senses apart", () => {
  const query = win.document.querySelector("#q");
  const verbParam = () => new URL(win.document.querySelector('#locale a[data-code="ru"]').href).searchParams.get("verb");

  query.value = "übersetzen";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
  [...win.document.querySelectorAll("#hits li")][0].click();
  const idA = verbParam();

  query.value = "übersetzen";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
  [...win.document.querySelectorAll("#hits li")][1].click();
  const idB = verbParam();

  expect(idA).not.toBe(idB);
  expect(new Set([idA, idB])).toEqual(new Set(["übersetzen", "übersetzen-2"]));

  query.value = "";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
});

// Stress marks the grammar: a separable prefix carries it, an inseparable one
// never does. Bolding the stressed half is how the card shows that.
test("the stressed half of the word is bolded, matching separability", () => {
  const query = win.document.querySelector("#q");

  query.value = "annehmen"; // separable: stress on the prefix
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
  [...win.document.querySelectorAll("#hits li")][0].click();
  expect(win.document.querySelector(".word b.sep")?.textContent).toBe("an");
  expect(win.document.querySelector(".word b.insep")).toBeNull();

  query.value = "übernehmen"; // inseparable: stress stays on the stem
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
  [...win.document.querySelectorAll("#hits li")][0].click();
  expect(win.document.querySelector(".word b.insep")?.textContent).toBe("nehmen");
  expect(win.document.querySelector(".word b.sep")).toBeNull();

  query.value = "";
  query.dispatchEvent(new win.Event("input", { bubbles: true }));
});

// Separability is part of the prefix: separable über- and inseparable über are
// two different prefixes spelled alike, and they take different stems. The
// stem reel matched on the text alone, so it offered übernehmen while über-
// was selected and then quietly switched you to the inseparable one.
test("the stem reel only offers stems that take the selected prefix", () => {
  const onPrefix = () => win.document.querySelector("#prefix .item.on");
  const badge = () => win.document.querySelector(".badges li").textContent;
  const stemLabels = () => shown("stem");

  const setzen = [...win.document.querySelectorAll("#stem .item")].find((i) => i.textContent === "setzen");
  setzen.click();
  const übers = [...win.document.querySelectorAll("#prefix .item")].filter((i) => i.textContent === "über");
  expect(übers.length).toBe(2);

  const sep = übers.find((i) => i.classList.contains("sep"));
  const insep = übers.find((i) => i.classList.contains("insep"));

  sep.click();
  expect(badge()).toBe("trennbar");
  const withSep = stemLabels();
  expect(withSep).not.toContain("nehmen"); // übernehmen is inseparable only

  insep.click();
  expect(badge()).toBe("untrennbar");
  const withInsep = stemLabels();
  expect(withInsep).toContain("nehmen");
  expect(withInsep.length).toBeGreaterThan(withSep.length);
});

// Whatever the reel shows, picking it has to land there. A stem that could not
// keep the selected prefix used to drag the selection somewhere else.
test("picking a stem keeps the prefix and its separability", () => {
  const state = () => ({
    prefix: win.document.querySelector("#prefix .item.on").textContent,
    kind: win.document.querySelector(".badges li").textContent,
    stem: win.document.querySelector("#stem .item.on").textContent,
  });

  // Picking a stem changes which prefixes exist, so the reel has to be put
  // back before each attempt or the row index means something else.
  const perch = (seed, p) => {
    [...win.document.querySelectorAll("#stem .item")].find((i) => i.textContent === seed).click();
    const rows = [...win.document.querySelectorAll("#prefix .item")];
    rows[Math.min(p, rows.length - 1)].click();
    return state();
  };

  let moves = 0;
  for (const seed of ["setzen", "fahren", "gehen", "nehmen"]) {
    if (![...win.document.querySelectorAll("#stem .item")].some((i) => i.textContent === seed)) continue;
    perch(seed, 0);
    const prefixCount = shown("prefix").length;
    for (let p = 0; p < prefixCount; p++) {
      perch(seed, p);
      for (const name of shown("stem").slice(0, 8)) {
        const before = perch(seed, p);
        const item = [...win.document.querySelectorAll("#stem .item")].find((i) => i.textContent === name);
        if (!item) continue;
        item.click();
        moves++;
        const after = state();
        expect(`${before.prefix}/${before.kind} -> ${name}: ${after.prefix}/${after.kind}/${after.stem}`)
          .toBe(`${before.prefix}/${before.kind} -> ${name}: ${before.prefix}/${before.kind}/${name}`);
      }
    }
  }
  expect(moves).toBeGreaterThan(50);
});

test("spinning lands on a real verb, every time", () => {
  const names = new Set(verbs.map((v) => v.name));
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    win.document.querySelector("#spin").click();
    expect(names.has(word())).toBe(true);
    seen.add(word());
  }
  expect(seen.size).toBeGreaterThan(30); // random, not stuck
});

// Switching language must not throw away the card being read: the picker
// carries it in the URL, and the links follow the reader as they browse.
test("the locale links carry the current card", () => {
  const href = () => win.document.querySelector('#locale a[data-code="ru"]').href;

  win.document.querySelector("#spin").click();
  const browsing = new URL(href());
  expect(browsing.pathname).toBe("/ru/");
  expect(browsing.searchParams.get("verb")).toBe(word());
  expect(browsing.searchParams.get("mode")).toBeNull();

  // Mid-guess the link still says cards: switching language is a request for
  // the meaning, so the card arrives turned over rather than hidden again.
  win.document.querySelector("#test").click();
  const guessing = new URL(href());
  expect(guessing.searchParams.get("verb")).toBe(word());
  expect(guessing.searchParams.get("mode")).toBe("cards");

  win.document.querySelector(".reveal").click();
  expect(new URL(href()).searchParams.get("mode")).toBe("cards");

  win.document.querySelector("#test").click();
});

// Tapping answers the card in front of you and then keeps rolling, which is the
// whole flow one-handed. Space and the next button are the same gesture; only
// the label is fixed, so it never tracks what the last press did.
test("space and the next button reveal first, then roll", () => {
  const press = (key) => win.dispatchEvent(new win.KeyboardEvent("keydown", { key }));
  const label = () => win.document.querySelector("#spin").firstChild.textContent.trim();

  win.document.querySelector("#test").click();
  expect(win.document.querySelector(".reveal")).not.toBeNull();
  const next = label();

  press(" ");
  expect(win.document.body.classList.contains("revealed")).toBe(true);
  expect(label()).toBe(next); // the label never moves

  press(" ");
  expect(win.document.body.classList.contains("revealed")).toBe(false); // rolled, hidden again
  expect(win.document.querySelector(".reveal")).not.toBeNull();

  // Enter reveals and never rolls, however many times it is pressed.
  const word0 = word();
  press("Enter");
  press("Enter");
  expect(win.document.body.classList.contains("revealed")).toBe(true);
  expect(word()).toBe(word0);

  // The button does what space does: a phone has no space bar, so tapping next
  // has to answer the card before it rolls, or the meaning is unreachable.
  win.document.querySelector("#spin").click(); // rolls, hidden
  expect(win.document.body.classList.contains("revealed")).toBe(false);
  const hidden = word();
  win.document.querySelector("#spin").click(); // reveals that same card
  expect(win.document.body.classList.contains("revealed")).toBe(true);
  expect(word()).toBe(hidden);
  win.document.querySelector("#spin").click(); // and only then rolls on
  expect(win.document.body.classList.contains("revealed")).toBe(false);

  win.document.querySelector("#test").click();
});

test("test mode is the one-armed bandit, and hides the meaning until revealed", () => {
  expect(items("prefix").length).toBe(shown("prefix").length); // browse: one copy
  win.document.querySelector("#test").click();
  expect(win.document.body.classList.contains("testing")).toBe(true);
  expect(items("prefix").length % 3).toBe(0); // three copies, for the roll
  expect(win.document.querySelector(".reveal")).not.toBeNull();
  win.document.querySelector(".reveal").click();
  expect(win.document.body.classList.contains("revealed")).toBe(true);
  expect(win.document.querySelector(".reveal")).toBeNull();
  win.document.querySelector("#test").click();
});
