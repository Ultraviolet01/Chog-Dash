// Every /api route goes through this one function (vercel.json rewrites /api/* here; lib/http.js ROUTES picks the
// handler). Vercel's free plan allows 12 functions.
module.exports = require("../lib/http.js").apiRoute;
