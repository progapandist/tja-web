PROJECT ?= tja

# The files the browser needs. Everything else — tests, docs, node_modules —
# stays out of the upload.
FILES := index.html style.css app.js data.js strings.js verbs.txt verbs.ru.txt _headers _redirects

.PHONY: dev test dist deploy clean

dev:
	bun run server.js

test:
	bun test

dist: $(FILES)
	rm -rf dist && mkdir -p dist && cp $(FILES) dist/

deploy: test dist
	wrangler pages deploy dist --project-name $(PROJECT)

clean:
	rm -rf dist
