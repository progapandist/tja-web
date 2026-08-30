PROJECT ?= tja

# The files the browser needs. Everything else — tests, docs, node_modules —
# stays out of the upload.
FILES := index.html style.css app.js data.js strings.js verbs.txt verbs.ru.txt _headers

.PHONY: dev test dist deploy clean

dev:
	bun run server.js

test:
	bun test

# Each locale gets a real index.html. A _redirects rewrite to /index.html does
# not survive Cloudflare stripping "index.html" from the URL: /ru ends up back
# at / and the locale is lost.
dist: $(FILES) stamp.js
	rm -rf dist && mkdir -p dist/en dist/ru && cp $(FILES) dist/
	node stamp.js
	cp dist/index.html dist/en/index.html
	cp dist/index.html dist/ru/index.html

deploy: test dist
	wrangler pages deploy dist --project-name $(PROJECT)

clean:
	rm -rf dist
