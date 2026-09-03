# CLAUDE.md

Read `README.md` first — it covers what the app is, how to run it, and the
`verbs.txt` line format. This file is only what the README leaves out.

## A verb lives in three files

`verbs.txt` is the German source. `verbs.ru.txt` and `verbs.fr.txt` are
overlays: they replace text fields, never add or drop an entry, and they are
matched positionally. Adding a verb means adding a line to all three, after the
same neighbour in the same stem block.

`app.test.js` checks that every entry is covered in both languages and that the
`übersetzen` and `umgehen` homographs don't swap translations, so a
German-only addition fails the build. Verb and stem counts are derived by
`stamp.js`, so nothing is bumped by hand.

## Build

```sh
make test       # bun test — app.test.js and build.test.js
make dist       # copies the shipping files into dist/, then node stamp.js
make preview    # serves dist/ on :3001
make deploy     # test, dist, wrangler pages deploy
```

`stamp.js` content-hashes the asset URLs and writes the per-locale pages, verb
indexes and sitemap, so `dist/` is the only place the site exists as it ships.
Never edit anything in `dist/` — `make dist` deletes it first.

## Working here

Verb additions often arrive as PRs against `main`, so `git fetch` before
starting. No framework, bundler or transpiler, and jsdom is the one dependency;
keep it that way.
