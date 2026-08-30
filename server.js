// Dev server: static files plus live reload. No bundler and no build step —
// the browser speaks ES modules, so this only has to hand the files over.
import { watch } from "node:fs";

const sockets = new Set();
const live = `<script>new WebSocket("ws://"+location.host+"/live").onmessage=()=>location.reload()</script>`;

watch(".", { recursive: true }, (_, file) => {
  if (!file || file.startsWith(".git")) return;
  for (const s of sockets) s.send("reload");
});

const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  websocket: { open: (s) => sockets.add(s), close: (s) => sockets.delete(s), message() {} },
  async fetch(req, server) {
    const path = new URL(req.url).pathname;
    if (path === "/live") return server.upgrade(req) ? undefined : new Response("expected websocket", { status: 400 });
    if (path === "/" || path === "/index.html") {
      return new Response((await Bun.file("index.html").text()) + live, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const file = Bun.file("." + path);
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});

console.log(`tja → http://localhost:${server.port}`);
