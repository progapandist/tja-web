import { expect, test, beforeAll } from "bun:test";
import { JSDOM } from "jsdom";
import { parse, forms, nebensatz, search } from "./data.js";

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

test("search ignores umlauts, spelled either way", () => {
  const names = (q) => search(verbs, q).map((v) => v.name);
  expect(names("ubernehm")[0]).toBe("übernehmen");
  expect(names("uebernehm")[0]).toBe("übernehmen");
  expect(names("mitneh")[0]).toBe("mitnehmen"); // a query spanning prefix and stem
  expect(names("lift")).toContain("mitnehmen"); // and meanings count too
  expect(names("xqzz")).toEqual([]);
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
