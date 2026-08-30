// The interface in two languages. The German itself is never translated: the
// forms, the rection and the example sentence are the thing being learned.

export const locales = ["en", "ru"];

export function localeFromPath(pathname) {
  const first = pathname.split("/")[1];
  return locales.includes(first) ? first : "en";
}

// 1 глагол, 2 глагола, 5 глаголов. Getting this wrong in an app about
// grammar would be embarrassing.
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ui = {
  en: {
    lang: "en",
    title: "tja — German prefix verbs",
    description: "German prefix verbs as a one-armed bandit: two reels, prefixes and stems, that filter each other.",
    searchPlaceholder: "Search verbs and meanings…",
    searchLabel: "Search verbs and meanings",
    resultsLabel: "Search results",
    prefixesLabel: "Prefixes",
    stemsLabel: "Stems",
    languageLabel: "Language",
    themeLabel: "Switch theme",
    prefix: "prefix",
    stem: "stem",
    count: (n) => `${n} verbs`,
    terminalLong: "nerdy version for your ",
    terminalShort: "terminal ↗",
    contribute: "contribute ↗",
    dark: "dark",
    light: "light",
    prompt: "What does it mean?",
    present: "present",
    past: "past",
    perfect: "perfect",
    subclause: "subclause",
    inTheWild: "In the wild",
    separable: "separable",
    inseparable: "inseparable",
    base: "base verb",
    randomVerb: "Random verb",
    nextCard: "Next card",
    lucky: "I’m feeling lucky",
    backToList: "Back to list",
    search: "Search",
    reveal: "Reveal",
  },
  ru: {
    lang: "ru",
    title: "tja — немецкие глаголы с приставками",
    description: "Немецкие глаголы с приставками как однорукий бандит: два барабана, приставки и корни, которые фильтруют друг друга.",
    searchPlaceholder: "Поиск по глаголам и значениям…",
    searchLabel: "Поиск по глаголам и значениям",
    resultsLabel: "Результаты поиска",
    prefixesLabel: "Приставки",
    stemsLabel: "Корни",
    languageLabel: "Язык",
    themeLabel: "Сменить тему",
    prefix: "приставка",
    stem: "корень",
    count: (n) => `${n} ${plural(n, "глагол", "глагола", "глаголов")}`,
    terminalLong: "версия для ",
    terminalShort: "терминала ↗",
    contribute: "поучаствовать ↗",
    dark: "тёмная",
    light: "светлая",
    prompt: "Что это значит?",
    present: "настоящее",
    past: "прошедшее",
    perfect: "перфект",
    subclause: "придаточное",
    inTheWild: "Как говорят",
    separable: "отделяемая",
    inseparable: "неотделяемая",
    base: "без приставки",
    randomVerb: "Случайный глагол",
    nextCard: "Следующая",
    lucky: "Мне повезёт",
    backToList: "К списку",
    search: "Поиск",
    reveal: "Показать",
  },
};
