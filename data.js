// verbs.txt is a pipe-delimited flat file — a text file and a split, not JSON
// with a schema, so it stays editable by hand:
//   =stem|gloss|präsens 3.sg|präteritum|partizip II|aux
//   verb|t or f (separable)|official|colloquial|example|use|english|aux override

export function parse(raw) {
  const stems = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const f = l.split("|");
    if (l.startsWith("=")) {
      stems.push({ name: f[0].slice(1), gloss: f[1], present: f[2], past: f[3], partII: f[4], aux: f[5], verbs: [] });
      continue;
    }
    const stem = stems.at(-1);
    stem.verbs.push({
      name: f[0], sep: f[1] === "t", official: f[2], colloquial: f[3],
      example: f[4], use: f[5], english: f[6], aux: f[7] || stem.aux, stem,
    });
  }
  return stems;
}

export const prefixOf = (v) => v.name.slice(0, v.name.length - v.stem.name.length);

// A verb's spelling is not always a unique key: German has real homographs
// where the same prefix attaches to the same stem two ways with two meanings
// (umgehen: to circumvent vs. to deal with; übersetzen: to translate vs. to
// ferry across) — same letters, different separability, different stress.
// Anything that addresses a specific verb (a URL, a lookup by name) needs an
// id that tells those two apart. The first of a colliding pair keeps its bare
// name, so an ordinary link still works; only the second one gets a suffix.
export function assignIds(verbs) {
  const seen = new Map();
  for (const v of verbs) {
    const n = (seen.get(v.name) ?? 0) + 1;
    seen.set(v.name, n);
    v.id = n === 1 ? v.name : `${v.name}-${n}`;
  }
  return verbs;
}

// The three places where the root actually changes. Separable prefixes hop to
// the end of the clause and ge- lands between prefix and root.
export function forms(v) {
  const p = prefixOf(v), s = v.stem;
  if (!p) return { present: s.present, past: s.past, perfect: `${v.aux} ${s.partII}` };
  if (v.sep) return { present: `${s.present} … ${p}`, past: `${s.past} … ${p}`, perfect: `${v.aux} ${p}${s.partII}` };
  return { present: p + s.present, past: p + s.past, perfect: `${v.aux} ${p}${s.partII.replace(/^ge/, "")}` };
}

const DA = { an: "daran", auf: "darauf", mit: "damit", von: "davon", zu: "dazu", über: "darüber",
  für: "dafür", bei: "dabei", in: "darin", nach: "danach", gegen: "dagegen", aus: "daraus",
  um: "darum", vor: "davor", durch: "dadurch", unter: "darunter" };

// A stand-in object built from the rection, so the generated clause is sayable.
// Only the first alternative counts: it is the main pattern.
//
// The pattern is read left to right rather than searched for a token anywhere
// inside it. Searching found "jdm" in the middle of "mit jdm+D" and returned a
// bare "mir", dropping the preposition the verb actually governs, and it found
// "jdm" before "etw+A" in "etw+A mit jdm+D" and picked the wrong object.
function object(v) {
  const pattern = v.use.split("·")[0].replace(/\([^)]*\)/g, "").trim();
  if (!pattern || pattern.startsWith("kein Obj")) return "";

  const tokens = pattern.split(/\s+/);
  let prep = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/jdm|jdn|jds|etw|sich/.test(token)) {
      // A preposition, sometimes written as alternatives ("an/bei"): keep the
      // first the da- table knows, since that is the form the clause will use.
      prep = token.replace(/\+[ADG]$/, "").split("/").find((p) => DA[p]) ?? prep;
      continue;
    }
    if (/\+G$/.test(token)) return ""; // a genitive stand-in reads worse than none
    // jdm is already dative; everything else says which case it wants.
    const dative = /\+D$/.test(token) || (/jdm/.test(token) && !/\+[AG]$/.test(token));
    const person = /jdm|jdn/.test(token);
    // A dative person or reflexive followed by an accusative thing takes both.
    const also = /etw\+A/.test(tokens[i + 1] ?? "") ? "das " : "";

    if (/sich/.test(token)) return prep ? `${prep} sich ` : `sich ${also}`.trimEnd() + " ";
    // The preposition governs its object, so it comes along. For a thing German
    // will not take "mit es", so the da- compound stands in instead.
    if (prep) return person && !/etw/.test(token) ? `${prep} ${dative ? "mir" : "mich"} ` : `${DA[prep]} `;
    if (person) return `${dative ? "mir" : "mich"} ${also}`.trimEnd() + " ";
    return dative ? "dem " : "es ";
  }
  return "";
}

// The one thing a main clause hides: in a subordinate clause the verb goes last
// and a separable prefix rejoins its stem — "ruft … an" becomes "anruft".
export const nebensatz = (v) => `…, weil sie ${object(v)}${prefixOf(v)}${v.stem.present}.`;

// Umlaut folding, so a query typed without them still matches. Trying both
// forms lets "uber" and "ueber" find übernehmen.
// ё is folded to е as well: Russian is written both ways and nobody reaches
// for the ё key to search.
const F = { "ä": "a", "ö": "o", "ü": "u", "ß": "s", "ё": "е" }, E = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
export const fold = (s) => s.replace(/[äöüßё]/g, (c) => F[c]);
const expand = (s) => s.replace(/[äöüß]/g, (c) => E[c]);
export const collate = (a, b) => fold(a).localeCompare(fold(b), "de");

// Every rune of q appears in s in order, scored by how tightly and early they
// sit — "anneh" and "annh" both find annehmen. -1 means no match.
function fuzzy(s, q) {
  let i = 0, first = -1, last = 0;
  for (const r of q) {
    while (i < s.length && s[i] !== r) i++;
    if (i === s.length) return -1;
    if (first < 0) first = i;
    last = i++;
  }
  return last - first + first;
}

// The whole word is matched, so a query spanning prefix and stem ("mitneh")
// works, and meanings count too.
export function search(verbs, query) {
  const q = fold(query.trim().toLowerCase());
  if (!q) return [];
  const scored = [];
  for (const v of verbs) {
    const name = fold(v.name.toLowerCase());
    if (name.startsWith(q)) { scored.push([v, -1000 + name.length]); continue; }
    let n = fuzzy(name, q);
    if (n < 0) n = fuzzy(expand(v.name.toLowerCase()), expand(query.trim().toLowerCase()));
    if (n >= 0) {
      scored.push([v, n]);
      continue;
    }
    // Nothing in the name, so try what the verb means. This is the only way in
    // for a query in the reader's own language, where the German is no help.
    const meaning = fold(`${v.official} ${v.colloquial} ${v.use} ${v.english}`.toLowerCase());
    const at = meaning.indexOf(q);
    if (at >= 0) {
      // A hit at the start of a word beats one buried inside a longer one, and
      // an early hit beats a late one: the meaning comes before the anecdote.
      const startsWord = at === 0 || !/\p{L}/u.test(meaning[at - 1]);
      scored.push([v, 1000 + (startsWord ? 0 : 400) + at]);
      continue;
    }
    // "сдать экзамен" should still find a card that says "сдать (экзамен)",
    // so a phrase falls back to needing every word somewhere in the entry.
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((word) => meaning.includes(word))) {
      scored.push([v, 2000]);
    }
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([v]) => v);
}

// verbs.ru.txt carries only the parts that are not German: the stem gloss and,
// per verb, the meaning, the colloquial note and the example's translation.
// Everything else on the card is the same in both languages.
//
//   =stem|gloss
//   verb|official|colloquial|example translation
export function translate(stems, raw) {
  // A couple of names occur twice on purpose — übersetzen and umgehen are each
  // a separable and an inseparable verb spelled alike — so translations are
  // handed out in file order rather than looked up by name alone.
  const pending = new Map();
  for (const stem of stems) {
    for (const verb of stem.verbs) {
      if (!pending.has(verb.name)) pending.set(verb.name, []);
      pending.get(verb.name).push(verb);
    }
  }

  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const f = l.split("|");
    if (l.startsWith("=")) {
      const stem = stems.find((s) => s.name === f[0].slice(1));
      if (stem) stem.gloss = f[1];
      continue;
    }
    const verb = pending.get(f[0])?.shift();
    if (!verb) continue;
    if (f[1]) verb.official = f[1];
    if (f[2]) verb.colloquial = f[2];
    if (f[3]) verb.english = f[3];
  }
  return stems;
}
