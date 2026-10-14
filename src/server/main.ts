import express from "express";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { marked } from "marked";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { createRooms, isRoomCode } from "./game.ts";

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { maxHttpBufferSize: 16_000 });
const rooms = createRooms(io);
app.use(express.json({ limit: "1kb" }));

// The lobby lists rooms with someone in them recently; anyone can open one.
app.get("/api/rooms", (_req, res) => {
  res.json({ rooms: rooms.list() });
});
app.post("/api/rooms", (_req, res) => {
  res.status(201).json({ code: rooms.create() });
});
// a room's persistent level, for checks and for anyone curious
app.get("/api/rooms/:code/level", (req, res) => {
  const level = isRoomCode(req.params.code) ? rooms.levelState(req.params.code) : null;
  if (!level) {
    res.status(404).json({ error: "no such room" });
    return;
  }
  res.json(level);
});

// README.md is the argument for the app, published in full and rendered on
// the server: the course check reads the HTML as sent, with no script run.
const readmePage = (): string => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About Chain Reaction</title>
    <link rel="icon" href="data:," />
    <style>
      body { margin: 0; background: #f4efe6; color: #2b2a28; font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
      main { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
      h1, h2 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-weight: 500; }
      a { color: #2b2a28; }
      img { max-width: 100%; }
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">&larr; Back to the level</a></p>
      ${marked.parse(readFileSync("README.md", "utf8"))}
    </main>
  </body>
</html>`;
app.get("/readme/", (req, res) => {
  // Express matches /readme here too; send it to /readme/ so relative image
  // links resolve under /readme/
  if (!req.originalUrl.startsWith("/readme/")) {
    res.redirect(301, "/readme/");
    return;
  }
  res.type("html").send(readmePage());
});
// relative image links in README.md resolve here, as they do on GitHub
app.use("/readme/docs", express.static("docs"));

// A room's activity log, newest last: who did what, refusals included. It
// names people by their public tag only (src/server/identity.ts).
app.get("/api/rooms/:code/log", (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  const log = isRoomCode(req.params.code) ? rooms.log(req.params.code, limit) : null;
  if (!log) {
    res.status(404).json({ error: "no such room" });
    return;
  }
  res.json({ events: log });
});

// The game client is built by Vite. In development Vite serves it from source
// through this same server, so `pnpm dev` is still one process on one port.
// Two pages: the lobby at / and a room at /r/CODE (the game, which reads the
// code from its URL).
if (process.env.NODE_ENV === "production") {
  app.get("/r/:code", (_req, res) => res.sendFile("room.html", { root: "dist/client" }));
  app.get("/", (_req, res) => res.sendFile("index.html", { root: "dist/client" }));
  app.use(express.static("dist/client", { index: false }));
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({ configFile: "vite.config.ts", server: { middlewareMode: true, hmr: { server: http } }, appType: "custom" });
  app.use(vite.middlewares);
  const page = (file: string) => async (req: express.Request, res: express.Response): Promise<void> => {
    const html = await vite.transformIndexHtml(req.originalUrl, readFileSync(`src/client/${file}`, "utf8"));
    res.type("html").send(html);
  };
  app.get("/r/:code", page("room.html"));
  app.get("/", page("index.html"));
}

const port = Number(process.env.PORT ?? 8080);
http.listen(port, "0.0.0.0", () => {
  console.log(`chain reaction listening on 0.0.0.0:${port}`);
});
