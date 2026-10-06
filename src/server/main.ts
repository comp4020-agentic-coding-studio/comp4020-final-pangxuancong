import express from "express";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { marked } from "marked";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { createGame } from "./game.ts";

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { maxHttpBufferSize: 16_000 });
const game = createGame(io);

// the persistent level, for checks and for anyone curious
app.get("/api/level", (_req, res) => {
  res.json(game.levelState());
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

// The game client is built by Vite. In development Vite serves it from source
// through this same server, so `pnpm dev` is still one process on one port.
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist/client"));
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({ configFile: "vite.config.ts", server: { middlewareMode: true, hmr: { server: http } }, appType: "spa" });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 8080);
http.listen(port, "0.0.0.0", () => {
  console.log(`chain reaction listening on 0.0.0.0:${port}`);
});
