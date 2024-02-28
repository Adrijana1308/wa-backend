import express from "express";
import cors from "cors";
import storage from "./memory_storage.js";

const app = express();
const port = 3000;

app.use(cors());

app.get("/posts", (req, res) => {
  res.json(storage.posts);
});

app.listen(port, () => console.log(`Slušam na portu ${port}!`));
