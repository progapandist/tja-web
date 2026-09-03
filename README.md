# tja

German prefix verbs in the browser. Pick a prefix and a stem from the two
columns; they filter each other, so anything you can land on is a real word.
The card gives you the meaning, where the prefix goes in each tense, and which
objects the verb takes.

Hit "i'm feeling lucky" and the columns turn into a slot machine. The reels
spin, you get a verb, you guess what it means.

827 verbs over 95 stems, shared with
[the terminal version](https://github.com/progapandist/tja).

![Browsing](docs/browse.jpg)

![Flashcards](docs/test.jpg)

## Running it

```sh
bun run dev    # localhost:3000, reloads on save
bun test
```

Bun 1.2 or newer. The test runner's DOM breaks on older ones.

## What's in it

No framework, bundler, transpiler or CSS library. The browser loads
`index.html`, `style.css` and two ES modules. jsdom is the only dependency and
only the tests touch it.

| file | |
|---|---|
| `verbs.txt` | the data, one line per verb, pipe-delimited |
| `data.js` | parses it, builds the forms, ranks the search |
| `app.js` | the columns, the card, the reels |
| `style.css` | |
| `server.js` | dev server with live reload, thirty lines |

Forms come out of the stem rather than the file. A separable prefix moves to
the end of the clause (`nimmt … an`) and keeps the `ge-` (`angenommen`). An
inseparable one stays put and loses it (`übernommen`).

## Adding verbs

Append to `verbs.txt`. A line starting with `=` opens a stem and carries its
principal parts. The lines under it are its prefixed verbs.

```
=stem|gloss|präsens 3.sg|präteritum|partizip II|aux
verb|separable t/f|official|colloquial|example|use|example in English|aux override
```

`verbs.ru.txt` and `verbs.fr.txt` are positional overlays over the same list, so
a new verb needs a line in each of them too, in the same place. `bun test` fails
if one is missing.

## Keys

| | |
|---|---|
| `space` | random verb, or the next card |
| `t` | flashcards |
| `/` | search; `uber` and `ueber` both find `übernehmen` |
| `enter` | reveal |
| arrows, `j` `k` | up and down the stems, left and right the prefixes |

Taps do everything the keys do. The columns scroll, the reels take a flick,
and the buttons along the bottom cover the rest.
