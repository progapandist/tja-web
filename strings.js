// The interface in every locale. The German itself is never translated: the
// forms, the rection and the example sentence are the thing being learned.

export const locales = ["en", "ru", "fr"];

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

// The grammar terms are German in every locale and never translated. The
// Präteritum is not the English past tense, and a learner needs the word their
// class actually uses; the terminal version has always labelled them this way.
const grammar = {
  present: "Präsens",
  past: "Präteritum",
  perfect: "Perfekt",
  subclause: "Nebensatz",
  separable: "trennbar",
  inseparable: "untrennbar",
  base: "Stamm",
};

export const ui = {
  en: {
    ...grammar,
    lang: "en",
    title: "tja · German prefix verbs, trennbar and untrennbar",
    description: "German prefix verbs as a one-armed bandit: 792 verbs from 90 stems, each with Präsens, Präteritum, Perfekt, its rection and an example sentence. Free, no sign-up.",
    keywords: "German prefix verbs, trennbare Verben, untrennbare Verben, separable verbs, inseparable verbs, German verb conjugation, Präsens, Präteritum, Perfekt, learn German, German grammar, German vocabulary, German flashcards",
    indexTitle: "All 792 German prefix verbs, by stem · tja",
    indexDescription: "Every German prefix verb in the collection, grouped by stem, with its meaning, whether the prefix separates, and all three tenses.",
    indexHeading: "All verbs, by stem",
    indexIntro: "Every verb in the collection: 792 of them, built from 90 stems. Each one gives the meaning, says whether the prefix separates, and shows the Präsens, Präteritum and Perfekt. Pick one to open it in the machine.",
    allVerbs: "all verbs",
    backToApp: "back to the machine",
    stemsHeading: (n) => `${n} stems`,
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
    terminalLong: "nerdy version for your terminal ↗",
    terminalShort: "terminal ↗",
    contribute: "contribute ↗",
    dark: "dark",
    light: "light",
    prompt: "What does it mean?",
    inTheWild: "In the wild",
    randomVerb: "Random verb",
    nextCard: "Next",
    lucky: "I’m feeling lucky",
    backToList: "Back to list",
    reveal: "Reveal",
  },
  ru: {
    ...grammar,
    lang: "ru",
    title: "tja · немецкие глаголы с приставками",
    description: "Немецкие глаголы с приставками как однорукий бандит: 792 глагола из 90 корней, у каждого Präsens, Präteritum, Perfekt, управление и пример. Бесплатно, без регистрации.",
    keywords: "немецкие глаголы с приставками, отделяемые приставки, неотделяемые приставки, спряжение немецких глаголов, Präsens, Präteritum, Perfekt, учить немецкий, немецкая грамматика, немецкие слова, карточки",
    indexTitle: "Все 792 немецких глагола с приставками · tja",
    indexDescription: "Все глаголы с приставками, сгруппированные по корням: значение, отделяемость приставки и три времени.",
    indexHeading: "Все глаголы по корням",
    indexIntro: "Все глаголы: 792 штуки из 90 корней. У каждого есть значение, пометка об отделяемости приставки и формы Präsens, Präteritum и Perfekt. Нажмите на любой, чтобы открыть его в автомате.",
    allVerbs: "все глаголы",
    backToApp: "к автомату",
    stemsHeading: (n) => `${n} ${plural(n, "корень", "корня", "корней")}`,
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
    terminalLong: "терминал ↗",
    terminalShort: "терминал ↗",
    contribute: "гитхаб ↗",
    dark: "тёмная",
    light: "светлая",
    prompt: "Что это значит?",
    inTheWild: "Как говорят",
    randomVerb: "Случайный глагол",
    nextCard: "Ещё",
    lucky: "Мне повезёт",
    backToList: "К списку",
    reveal: "Показать",
  },
  fr: {
    ...grammar,
    lang: "fr",
    title: "tja · verbes à particule allemands",
    description: "Les verbes à particule allemands comme un bandit manchot : 792 verbes issus de 90 radicaux, chacun avec Präsens, Präteritum, Perfekt, sa rection et une phrase d'exemple. Gratuit, sans inscription.",
    keywords: "verbes à particule allemands, particules séparables, particules inséparables, conjugaison allemande, Präsens, Präteritum, Perfekt, apprendre l'allemand, grammaire allemande, vocabulaire allemand, cartes mémoire",
    indexTitle: "Les 792 verbes à particule allemands, par radical · tja",
    indexDescription: "Tous les verbes à particule de la collection, groupés par radical, avec le sens, la séparabilité de la particule et les trois temps.",
    indexHeading: "Tous les verbes, par radical",
    indexIntro: "Tous les verbes de la collection : 792, formés sur 90 radicaux. Chaque entrée donne le sens, indique si la particule se sépare et montre le Präsens, le Präteritum et le Perfekt. Cliquez sur un verbe pour l'ouvrir dans la machine.",
    allVerbs: "tous les verbes",
    backToApp: "retour à la machine",
    stemsHeading: (n) => `${n} radica${n > 1 ? "ux" : "l"}`,
    searchPlaceholder: "Rechercher un verbe ou un sens…",
    searchLabel: "Rechercher un verbe ou un sens",
    resultsLabel: "Résultats de recherche",
    prefixesLabel: "Particules",
    stemsLabel: "Radicaux",
    languageLabel: "Langue",
    themeLabel: "Changer de thème",
    prefix: "particule",
    stem: "radical",
    count: (n) => `${n} verbe${n > 1 ? "s" : ""}`,
    terminalLong: "la version pour geeks, dans ton terminal ↗",
    terminalShort: "terminal ↗",
    contribute: "contribuer ↗",
    dark: "sombre",
    light: "clair",
    prompt: "Qu'est-ce que ça veut dire ?",
    inTheWild: "Dans la vraie vie",
    randomVerb: "Verbe au hasard",
    nextCard: "Encore",
    lucky: "J'ai de la chance",
    backToList: "Retour à la liste",
    reveal: "Afficher",
  },
};
