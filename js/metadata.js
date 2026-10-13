/*
 * Token metadata and image loading with IPFS gateway fallback.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else root.ChogMetadata = factory(root.ChogConfig);
})(typeof self !== "undefined" ? self : this, function (config) {
  // Turns any token or image URI into a list of URLs to try, in order.
  function candidateUrls(uri) {
    if (!uri || typeof uri !== "string") return [];
    uri = uri.trim();
    if (uri.startsWith("data:")) return [uri];
    let path = null;
    if (uri.startsWith("ipfs://")) path = uri.slice(7).replace(/^ipfs\//, "");
    else {
      const m = uri.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/);
      if (m) path = m[1];
    }
    if (!path) return [uri];
    const urls = config.ipfsGateways.map(g => g + path);
    if (uri.startsWith("http") && !urls.includes(uri)) urls.unshift(uri);
    return urls;
  }

  async function fetchWithTimeout(url, ms) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), ms);
    try { return await fetch(url, ctrl ? { signal: ctrl.signal } : {}); }
    finally { clearTimeout(timer); }
  }

  async function fetchJson(uri) {
    const urls = candidateUrls(uri);
    if (!urls.length) throw new Error("Token has no metadata link");
    const errors = [];
    for (const url of urls) {
      try {
        if (url.startsWith("data:")) {
          const [head, body] = url.split(",", 2);
          const text = head.includes(";base64") ? atob(body) : decodeURIComponent(body);
          return { json: JSON.parse(text), url: "data:" };
        }
        const res = await fetchWithTimeout(url, config.fetchTimeoutMs);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return { json: await res.json(), url };
      } catch (e) {
        errors.push(url + ": " + (e.name === "AbortError" ? "timed out" : e.message));
      }
    }
    throw new Error("Could not load metadata from any gateway\n" + errors.join("\n"));
  }

  // Loads an image that WebGL can use (needs CORS). Tries each gateway in turn.
  function loadImage(uri) {
    const urls = candidateUrls(uri);
    return new Promise((resolve, reject) => {
      if (!urls.length) return reject(new Error("Metadata has no image link"));
      let i = 0;
      const next = () => {
        if (i >= urls.length) return reject(new Error("Could not load the NFT image from any gateway"));
        const url = urls[i++];
        const img = new Image();
        img.crossOrigin = "anonymous";
        let settled = false;
        const fail = () => { if (settled) return; settled = true; clearTimeout(timer); next(); };
        const timer = setTimeout(fail, config.fetchTimeoutMs);
        img.onload = () => { if (settled) return; settled = true; clearTimeout(timer); resolve({ img, url }); };
        img.onerror = fail;
        img.src = url;
      };
      next();
    });
  }

  return { candidateUrls, fetchJson, loadImage };
});
