import express from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { LAYOUT, RAMP, isValidAngle, simulate } from "../shared/simulation.ts";
import { readMachine, recordAttempt, setRampAngle } from "./db.ts";

const app = express();
app.use(express.json({ limit: "4kb" }));

// The machine is frozen while a run plays, so what everyone watches is the
// machine that was snapshotted.
let runningUntil = 0;
const running = (): boolean => Date.now() < runningUntil;

app.get("/api/machine", (_req, res) => {
  res.json({ layout: LAYOUT, bounds: { ramp: RAMP }, running: running(), ...readMachine() });
});

app.put("/api/mechanisms/ramp", (req, res) => {
  const angle = req.body?.angle;
  if (!isValidAngle(angle)) {
    res.status(400).json({ error: `angle must be a number from ${RAMP.min} to ${RAMP.max}` });
    return;
  }
  if (running()) {
    res.status(409).json({ error: "the machine is running" });
    return;
  }
  setRampAngle(angle);
  res.json(readMachine());
});

app.post("/api/runs", (_req, res) => {
  if (running()) {
    res.status(409).json({ error: "the machine is already running" });
    return;
  }
  const plan = simulate(readMachine().ramp.angle, randomUUID());
  recordAttempt(plan);
  runningUntil = Date.now() + plan.totalMs;
  res.status(201).json(plan);
});

// README.md is the argument for the app, published in full and rendered on
// the server: the course check reads the HTML as sent, with no script run.
const readmePage = (): string => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About Chain Reaction</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="readme">
    <main>
      <p><a href="/">&larr; Back to the machine</a></p>
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

app.use(express.static("public"));

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => {
  console.log(`chain reaction listening on 0.0.0.0:${port}`);
});
