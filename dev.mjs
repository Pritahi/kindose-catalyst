import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import care from "./api/care.mjs";
import cron from "./api/cron.mjs";
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
http
  .createServer(async (req, res) => {
    res.json = (x) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(x));
    };
    try {
      let path = new URL(req.url, "http://localhost").pathname;
      if (path.startsWith("/api/")) {
        let raw = "";
        for await (let chunk of req) {
          raw += chunk;
          if (raw.length > 20000) {
            res.statusCode = 413;
            return res.end();
          }
        }
        req.body = raw ? JSON.parse(raw) : {};
        return path === "/api/cron" ? cron(req, res) : care(req, res);
      }
      let file = resolve("public", "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(resolve("public") + "/")) {
        res.statusCode = 403;
        return res.end();
      }
      res.setHeader("Content-Type", types[extname(file)] || "text/plain");
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  })
  .listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log("KinDose: http://localhost:3000"),
  );
