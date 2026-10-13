/*
 * Local development server: serves the game and the /api routes on one port.
 *   npm run dev            -> http://localhost:3000
 * Uses in-memory storage unless the Upstash variables are set.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { dispatch } = require("../lib/http.js");

const ROOT = path.join(__dirname, "..");
const ROUTES = {
  "/api/auth/nonce": "authNonce", "/api/auth/verify": "authVerify",
  "/api/run/start": "runStart", "/api/run/finish": "runFinish", "/api/leaderboard": "leaderboard",
};
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain" };
const PUBLIC = ["/index.html", "/css/", "/js/"];   // only these are served as static files

function startServer({ port = 3000, handlers } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (ROUTES[url.pathname]) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (e) {}
      const out = await dispatch(ROUTES[url.pathname], { method: req.method, body, authorization: req.headers.authorization }, handlers);
      res.writeHead(out.status, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(out.body));
    }
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT) || !PUBLIC.some(pre => p === pre || p.startsWith(pre)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end("Not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  startServer({ port }).then(() => console.log("Chog Dash running at http://localhost:" + port));
}

module.exports = { startServer };
