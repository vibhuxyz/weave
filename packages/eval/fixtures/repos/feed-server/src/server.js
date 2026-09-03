import { createServer } from "node:http";
import { loadConfig } from "./config.js";

const config = loadConfig();

// BUG: `loadConfig` returns the listen options under `server`, not `http`.
// Destructuring an undefined property throws on startup, so the process dies
// immediately instead of serving anything.
const { port, host } = config.http;

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({ title: config.feed.title, items: [], pageSize: config.feed.pageSize }),
  );
});

server.listen(port, host, () => {
  console.log(`feed server listening on http://${host}:${server.address().port}`);
});
