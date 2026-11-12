import express from "express";
import telegramHandler from "./api/telegram.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const app = express();
const rootDir = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "2mb" }));

// Serve the current source assets without allowing an old browser/CDN copy
// of app.js or styles.css to survive a production update.
app.use(express.static(rootDir, {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));

app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
