PROJECT ?= tja

# The files the browser needs. Everything else — tests, docs, node_modules —
# stays out of the upload. og.html is the source for og.png and does not ship.
FILES := index.html 404.html style.css app.js data.js strings.js robots.txt og.png \
         verbs.txt verbs.ru.txt verbs.fr.txt _headers \
         googlec2338afcce487655.html

.PHONY: dev test dist deploy og preview clean

dev:
	bun run server.js

test:
	bun test

# stamp.js writes every locale page and the sitemap; the copy step it replaced
# could not give /ru/ its own title, canonical or hreflang.
dist: $(FILES) stamp.js
	rm -rf dist && mkdir -p dist && cp $(FILES) dist/
	node stamp.js

# The social card. Re-shot only when og.html changes, since the PNG is what
# ships and headless Chrome is not something the build should need every time.
og: og.html
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
	  --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
	  --screenshot=og.png "file://$(CURDIR)/og.html"

# The verb index only exists after a build, so previewing it means serving dist.
preview: dist
	cd dist && python3 -m http.server 3001

deploy: test dist
	wrangler pages deploy dist --project-name $(PROJECT)

clean:
	rm -rf dist
