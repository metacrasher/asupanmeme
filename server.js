import express from "express";
import telegramHandler from "./api/telegram.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const app = express();
const rootDir = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "2mb" }));

// Serve the ASUPANMEME website at the root URL.
app.use(express.static(rootDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

// Keep the Telegram webhook endpoint available.
app.post("/telegram", telegramHandler);

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1") {
  app.listen(port, "0.0.0.0", () => {
    console.log(`ASUPANMEME server listening on port ${port}`);
  });
}

export default app;
