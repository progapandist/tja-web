PROJECT ?= tja

# The files the browser needs. Everything else — tests, docs, node_modules —
# stays out of the upload. og.html is the source for og.png and does not ship.
FILES := index.html 404.html style.css app.js data.js strings.js robots.txt og.png \
         verbs.txt verbs.ru.txt verbs.fr.txt _headers \
         icon-180.png icon-192.png icon-512.png sw.js \
         googlec2338afcce487655.html

.PHONY: dev test dist deploy og icons preview clean

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

# The home-screen icons. Same deal as og: shot once from icon.html, and the
# PNGs are what ship. 180 is what iOS asks for, 192 and 512 what the manifest
# offers everyone else.
icons: icon.html
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
	  --hide-scrollbars --force-device-scale-factor=1 --window-size=512,512 \
	  --screenshot=icon-512.png "file://$(CURDIR)/icon.html"
	@# Shot once and scaled down, because headless Chrome will not render a
	@# window narrower than about 500px: asking it for 180 gives back the
	@# top-left corner of a bigger drawing, not a small one.
	sips -Z 192 icon-512.png --out icon-192.png >/dev/null
	sips -Z 180 icon-512.png --out icon-180.png >/dev/null

# The verb index only exists after a build, so previewing it means serving dist.
preview: dist
	cd dist && python3 -m http.server 3001

deploy: test dist
	wrangler pages deploy dist --project-name $(PROJECT)

clean:
	rm -rf dist
