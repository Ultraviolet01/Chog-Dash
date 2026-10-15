/*
 * Local development server: serves the game and the /api routes on one port.
 *   npm run dev            -> http://localhost:3000
 * Uses in-memory storage unless SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { dispatch } = require("../lib/http.js");

const ROOT = path.join(__dirname, "..");
const ROUTES = {
  "/api/auth/nonce": "authNonce", "/api/auth/verify": "authVerify",
  "/api/run/start": "runStart", "/api/run/finish": "runFinish", "/api/leaderboard": "leaderboard",
  "/api/profile": "profileSet", "/api/quests": "questsGet", "/api/badge/pin": "badgePin", "/api/demo-leaderboard": "demoLeaderboard",
};
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain", ".mp3": "audio/mpeg" };
const PUBLIC = ["/index.html", "/css/", "/js/", "/audio/"];   // only these are served as static files

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
    const type = TYPES[path.extname(file)] || "application/octet-stream", size = fs.statSync(file).size;
    // Byte ranges, so the browser can seek in the music track (as it can on Vercel)
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { "content-range": "bytes */" + size }); return res.end(); }
      res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  startServer({ port }).then(() => console.log("Chog Dash running at http://localhost:" + port));
}

module.exports = { startServer };
