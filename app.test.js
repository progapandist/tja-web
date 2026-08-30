import { expect, test, beforeAll } from "bun:test";
import { JSDOM } from "jsdom";
import { parse, forms, nebensatz, search, translate, collate } from "./data.js";

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
