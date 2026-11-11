import express from "express";
import telegramHandler from "./api/telegram.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.status(200).send("ASUPANMEME Telegram bot is running.");
});

app.post("/telegram", telegramHandler);

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`ASUPANMEME bot listening on port ${port}`);
});
