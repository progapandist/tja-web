import { parse, prefixOf, forms, nebensatz, search, collate, translate } from "./data.js";
import { localeFromPath, locales, ui } from "./strings.js";

// index.html kicks this off while it is still parsing; falling back keeps the
// module usable on its own, which is how the tests load it.
const locale = localeFromPath(globalThis.location?.pathname ?? "/");
const t = ui[locale];

const raw = await (globalThis.verbsText ?? fetch("/verbs.txt").then((r) => r.text()));
const stems = parse(raw).sort((a, b) => collate(a.name, b.name));
if (globalThis.verbsOverlay) translate(stems, await globalThis.verbsOverlay);
const verbs = stems.flatMap((stem) => stem.verbs);
const byName = new Map(verbs.map((verb) => [verb.name, verb]));
const prefixes = [...new Set(verbs.map(prefixOf))].sort(collate);

// Is prefix + stem an actual German word?
function isWord(prefix, stem) {
  return byName.has(prefix + stem.name);
}

const find = (selector) => document.querySelector(selector);
const firstVerb = byName.get("annehmen") ?? verbs[0];

const state = {
  prefix: prefixOf(firstVerb),
  stem: firstVerb.stem,
  testing: false, // flashcards: the one-armed bandit, one card at a time
  revealed: true, // in test mode, whether the meaning is on show yet
};

const selectedVerb = () => byName.get(state.prefix + state.stem.name);

// The locale picker hands the current card over in the URL, so switching
// language keeps you on the word you were reading rather than dropping you
// back at the start. An unknown or missing verb just falls through.
const params = new URLSearchParams(globalThis.location?.search ?? "");
const asked = byName.get(params.get("verb") ?? "");
if (asked) {
  state.prefix = prefixOf(asked);
  state.stem = asked.stem;
}
if (params.get("mode") === "cards") {
  state.testing = true;
  state.revealed = true;
}

function hrefFor(code) {
  const query = new URLSearchParams({ verb: selectedVerb().name });
  // Always turned over: switching language mid-guess is how you ask what the
  // word means in the other language, not a request to keep guessing.
  if (state.testing) query.set("mode", "cards");
  return `${code === "en" ? "/" : `/${code}/`}?${query}`;
}

// Each column shows only what pairs with the other column's selection, so
// every combination you can land on is a real word.
const prefixOptions = () => prefixes.filter((prefix) => isWord(prefix, state.stem));
const stemOptions = () => stems.filter((stem) => isWord(state.prefix, stem));

// ---- the two columns -------------------------------------------------------
// Browsing, a column is an ordinary scrolling list. Testing, it becomes a slot
// reel: the strip holds three copies of the list, so every position is
// visually identical to itself one list-length higher up. That makes the roll
// cheap — put the strip at its final resting place, then animate it in from a
// copy or three above, and the eye sees a spin.

function Column(element, labelOf, onPick) {
  const strip = element.querySelector(".strip");
  let keys = []; // one key per option, in display order
  let selectedIndex = () => 0;
  let copiesDrawn = 0;
  let drag = null;

  // Not every browser swallows the click that follows a drag. Without this, a
  // flick would pick twice: once on release, once on the item under the finger.
  let justDragged = false;

  const itemHeight = () => strip.firstElementChild?.offsetHeight || 1;

  // Where the strip has to sit for option i to land in the middle window. The
  // middle copy is the one we aim at, hence the extra keys.length.
  function restingPosition(i) {
    return -(keys.length + i) * itemHeight() + (element.clientHeight - itemHeight()) / 2;
  }

  function step(by) {
    const next = Math.min(keys.length - 1, Math.max(0, selectedIndex() + by));
    onPick(keys[next]);
  }

  function draw(options, nextKeys, selected) {
    // A leftover reel position would throw off where the browsing list scrolls to.
    if (!state.testing) strip.style.transform = "";

    const copies = state.testing ? 3 : 1;
    if (copies !== copiesDrawn || nextKeys.join(" ") !== keys.join(" ")) {
      copiesDrawn = copies;
      keys = nextKeys;
      const items = [];
      for (let copy = 0; copy < copies; copy++) {
        options.forEach((option, i) => {
          const item = document.createElement("div");
          item.className = "item";
          item.textContent = labelOf(option);
          item.id = `${element.id}-${copy}-${i}`;
          item.setAttribute("role", "option");
          item.onclick = () => justDragged || onPick(nextKeys[i]);
          items.push(item);
        });
      }
      strip.replaceChildren(...items);
    }

    [...strip.children].forEach((item, i) => {
      const isSelected = i % keys.length === selected;
      item.classList.toggle("on", isSelected);
      item.setAttribute("aria-selected", isSelected);
      if (!isSelected) return;
      element.setAttribute("aria-activedescendant", item.id);
      if (!state.testing) item.scrollIntoView({ block: "nearest" });
    });
  }

  // turns is how many full lists to travel through on the way; zero is a nudge.
  function moveTo(i, turns = 0, ms = 240) {
    if (!state.testing) return; // the browsing list scrolls on its own
    element.scrollTop = 0; // browsing may have left the list scrolled
    const y = restingPosition(i);
    const from = y + turns * keys.length * itemHeight();
    strip.style.transform = `translateY(${y}px)`;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    strip.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${y}px)` }], {
      duration: turns ? ms : 220,
      easing: turns ? "cubic-bezier(.16,.9,.28,1)" : "ease-out",
    });
  }

  element.addEventListener(
    "wheel",
    (event) => {
      if (!state.testing) return; // the browsing list scrolls on its own
      event.preventDefault();
      step(Math.sign(event.deltaY));
    },
    { passive: false },
  );

  element.addEventListener("pointerdown", (event) => {
    if (event.button || !state.testing) return;
    drag = { startY: event.clientY, startIndex: selectedIndex(), moved: false };
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    strip.style.transform = `translateY(${restingPosition(drag.startIndex) + dy}px)`;
  });

  element.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const dragged = drag.moved;
    const rows = Math.round((event.clientY - drag.startY) / itemHeight());
    const landed = Math.min(keys.length - 1, Math.max(0, drag.startIndex - rows));
    const startIndex = drag.startIndex;
    drag = null;

    if (!dragged) {
      moveTo(startIndex);
      return;
    }
    justDragged = true;
    setTimeout(() => (justDragged = false)); // the click lands before any timer
    onPick(keys[landed]);
  });

  element.addEventListener("pointercancel", () => {
    if (drag) moveTo(drag.startIndex);
    drag = null;
  });

  element.addEventListener("keydown", (event) => {
    const by = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1, PageDown: 5, PageUp: -5 }[event.key];
    if (!by) return;
    event.preventDefault();
    event.stopPropagation(); // the same keys are bound globally, for when nothing has focus
    step(by);
  });

  return { draw, moveTo, step, watchIndex: (fn) => (selectedIndex = fn) };
}

// Picking something the other column cannot pair with moves that column too,
// rather than leaving a combination that is not a word.
const prefixColumn = Column(
  find("#prefix"),
  (prefix) => prefix || "—",
  (prefix) => {
    if (prefix === undefined) return;
    state.prefix = prefix;
    if (!isWord(prefix, state.stem)) state.stem = stems.find((stem) => isWord(prefix, stem));
    render({ reposition: true });
  },
);

const stemColumn = Column(
  find("#stem"),
  (stem) => stem.name,
  (name) => {
    const stem = stems.find((candidate) => candidate.name === name);
    if (!stem) return;
    state.stem = stem;
    if (!isWord(state.prefix, stem)) {
      state.prefix = prefixes.find((prefix) => isWord(prefix, stem));
    }
    render({ reposition: true });
  },
);

prefixColumn.watchIndex(() => Math.max(0, prefixOptions().indexOf(state.prefix)));
stemColumn.watchIndex(() => Math.max(0, stemOptions().indexOf(state.stem)));

// ---- the card --------------------------------------------------------------
const escape = (text) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function cardHTML(verb) {
  const { present, past, perfect } = forms(verb);
  const prefix = prefixOf(verb);
  const kind = !prefix ? t.base : verb.sep ? t.separable : t.inseparable;
  const reveal = `<button class="primary reveal" type="button">${t.reveal} <kbd>space / enter</kbd></button>`;

  return `
    <p class="prompt">${t.prompt}</p>
    <h2 class="word">${prefix ? `<b>${escape(prefix)}</b>` : ""}${escape(verb.stem.name)}</h2>
    <div class="answer">
      <p class="gloss">${escape(verb.official)}</p>
      <ul class="badges">
        <li class="${!prefix ? "bare" : verb.sep ? "sep" : "insep"}">${kind}</li>
        <li>${escape(verb.aux)}</li>
        <li class="use">${escape(verb.use)}</li>
      </ul>
      <dl class="forms">
        <dt>${t.present}</dt><dd>er/sie ${escape(present)}</dd>
        <dt>${t.past}</dt><dd>er/sie ${escape(past)}</dd>
        <dt>${t.perfect}</dt><dd>er/sie ${escape(perfect)}</dd>
        <dt>${t.subclause}</dt><dd>${escape(nebensatz(verb))}</dd>
      </dl>
      <h3>${t.inTheWild}</h3>
      <p class="colloquial">${escape(verb.colloquial)}</p>
      <blockquote><p lang="de">${escape(verb.example)}</p><p class="en">${escape(verb.english)}</p></blockquote>
    </div>
    ${state.testing && !state.revealed ? reveal : ""}`;
}

// reposition moves the columns to the selection; turns > 0 makes that a spin.
function render({ reposition = false, turns = 0 } = {}) {
  // The mode classes decide how tall the columns are, so they go on before
  // anything measures the layout.
  document.body.classList.toggle("testing", state.testing);
  document.body.classList.toggle("revealed", state.revealed);

  const prefixList = prefixOptions();
  const stemList = stemOptions();

  prefixColumn.draw(prefixList, prefixList, prefixList.indexOf(state.prefix));
  stemColumn.draw(stemList, stemList.map((stem) => stem.name), stemList.indexOf(state.stem));

  if (reposition) {
    prefixColumn.moveTo(prefixList.indexOf(state.prefix), turns, 850);
    stemColumn.moveTo(stemList.indexOf(state.stem), turns, 1150);
  }

  find("#spin").firstChild.textContent = (state.testing ? t.nextCard : t.randomVerb) + " ";
  find("#test").firstChild.textContent = (state.testing ? t.backToList : t.lucky) + " ";
  find("#spin").classList.toggle("primary", state.testing);
  find("#test").classList.toggle("primary", !state.testing);
  for (const link of localeLinks) link.href = hrefFor(link.dataset.code);
  find("#card").innerHTML = cardHTML(selectedVerb());
  find("#card").querySelector(".reveal")?.addEventListener("click", reveal);
}

function reveal() {
  state.revealed = true;
  render();
}

// Answer the card in front of you, then roll from the next press on. The
// footer button and the space bar both land here: on a phone there is no space
// bar, so the button has to carry the whole flow on its own. Its label stays
// "next" either way rather than tracking what the last press did.
function revealOrNext() {
  if (state.testing && !state.revealed) reveal();
  else nextCard();
}

function nextCard() {
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  state.prefix = prefixOf(verb);
  state.stem = verb.stem;
  state.revealed = !state.testing;
  render({ reposition: true, turns: 3 });
}


// ---- search ----------------------------------------------------------------
const query = find("#q");
const results = find("#hits");

function show(verb) {
  if (!verb) return;
  state.prefix = prefixOf(verb);
  state.stem = verb.stem;
  state.revealed = true;
  query.value = "";
  closeResults();
  query.blur();
  render({ reposition: true, turns: 1 });
}

let matches = []; // what the last query found
let highlighted = 0; // which of them the arrow keys are on

function closeResults() {
  results.hidden = true;
  matches = [];
  query.setAttribute("aria-expanded", "false");
  query.removeAttribute("aria-activedescendant");
}

function highlight(index) {
  highlighted = Math.min(matches.length - 1, Math.max(0, index));
  [...results.children].forEach((row, i) => {
    const on = i === highlighted;
    row.classList.toggle("on", on);
    row.setAttribute("aria-selected", on);
    if (on) {
      query.setAttribute("aria-activedescendant", row.id);
      row.scrollIntoView({ block: "nearest" });
    }
  });
}

query.addEventListener("input", () => {
  matches = search(verbs, query.value).slice(0, 12);
  if (matches.length === 0) {
    closeResults();
    return;
  }
  results.replaceChildren(
    ...matches.map((verb, i) => {
      const row = document.createElement("li");
      row.id = `hit-${i}`;
      row.setAttribute("role", "option");
      row.innerHTML = `<b lang="de">${escape(verb.name)}</b><span>${escape(verb.official)}</span>`;
      row.onclick = () => show(verb);
      return row;
    }),
  );
  results.hidden = false;
  query.setAttribute("aria-expanded", "true");
  highlight(0);
});

query.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    query.value = "";
    closeResults();
    query.blur();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    show(matches[highlighted]);
    return;
  }
  if (matches.length === 0) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    highlight(highlighted + 1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    highlight(highlighted - 1);
  }
});

addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".find")) closeResults();
});

// ---- controls --------------------------------------------------------------
function toggleTesting() {
  state.testing = !state.testing;
  state.revealed = !state.testing;
  render({ reposition: true, turns: state.testing ? 3 : 0 });
}

find("#spin").onclick = revealOrNext;
find("#test").onclick = toggleTesting;

addEventListener("keydown", (event) => {
  const focused = event.target.tagName;
  if (focused === "INPUT" || event.metaKey || event.ctrlKey || event.altKey) return;
  // A focused button already answers space and enter; taking those would fire twice.
  const buttonsOwn = event.key === " " || event.key === "Enter";
  if (focused === "BUTTON" && buttonsOwn) return;

  // The columns are tabbable, but with focus nowhere they still answer the
  // arrows: up and down work the stems, left and right the prefixes.
  const shortcuts = {
    " ": revealOrNext,
    t: toggleTesting,
    Enter: () => state.testing && !state.revealed && reveal(),
    ArrowDown: () => stemColumn.step(1),
    j: () => stemColumn.step(1),
    ArrowUp: () => stemColumn.step(-1),
    k: () => stemColumn.step(-1),
    ArrowRight: () => prefixColumn.step(1),
    ArrowLeft: () => prefixColumn.step(-1),
    "/": () => query.focus(),
  };

  const action = shortcuts[event.key];
  if (!action) return;
  event.preventDefault();
  action();
});

// A phone fires resize every time the URL bar slides away, and re-rendering
// scrolls the selected row back into view, so the list fights the reader's
// thumb. Only a real change of geometry is worth redrawing for.
const viewport = () => [document.documentElement.clientWidth, document.documentElement.clientHeight];
let [lastWidth, lastHeight] = viewport();
addEventListener("resize", () => {
  const [width, height] = viewport();
  const changed = width !== lastWidth || height !== lastHeight;
  const widthChanged = width !== lastWidth;
  [lastWidth, lastHeight] = [width, height];
  // Height alone only matters to the reels, whose rows are sized off it.
  if (changed && (widthChanged || state.testing)) render({ reposition: true });
});

// ---- theme -----------------------------------------------------------------
// The system preference decides until the reader overrules it, and then that
// choice is remembered. index.html applies it before the first paint.
const themeButton = find("#theme");

function currentTheme() {
  if (document.documentElement.dataset.theme) return document.documentElement.dataset.theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function labelTheme() {
  themeButton.textContent = currentTheme() === "dark" ? t.light : t.dark;
}

themeButton.onclick = () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch (error) {
    // A browser with storage switched off still gets the theme, just not the memory.
  }
  labelTheme();
};

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", labelTheme);
labelTheme();

// Everything the locale decides that is not drawn by render().
document.documentElement.lang = t.lang;
document.title = t.title;
document.querySelector('meta[name="description"]').content = t.description;
find("#count").textContent = t.count(verbs.length);
find("#t-prefix").textContent = t.prefix;
find("#t-stem").textContent = t.stem;
query.placeholder = t.searchPlaceholder;
query.setAttribute("aria-label", t.searchLabel);
results.setAttribute("aria-label", t.resultsLabel);
find("#prefix").setAttribute("aria-label", t.prefixesLabel);
find("#stem").setAttribute("aria-label", t.stemsLabel);
themeButton.setAttribute("aria-label", t.themeLabel);
find("#locale").setAttribute("aria-label", t.languageLabel);
// Two complete strings rather than one with words hidden: shortening Russian
// by chopping the front leaves the case ending stranded.
find(".contrib.nerdy").innerHTML =
  `<span class="wide-only">${t.terminalLong}</span><span class="narrow-only">${t.terminalShort}</span>`;
find("#contribute").textContent = t.contribute;
// The build writes this link into the static HTML for crawlers; setting it
// here too keeps the dev server, which serves the source, showing the same.
find("#all-verbs").textContent = t.allVerbs;
find("#all-verbs").href = locale === "en" ? "/verbs/" : `/${locale}/verbs/`;

// Two links rather than a toggle: switching language is a navigation, and a
// reload here costs nothing that is not already cached.
const localeLinks = locales.map((code) => {
  const link = document.createElement("a");
  link.dataset.code = code;
  link.textContent = code.toUpperCase();
  link.className = code === locale ? "on" : "";
  if (code === locale) link.setAttribute("aria-current", "true");
  return link;
});
find("#locale").replaceChildren(...localeLinks);

render({ reposition: true });
