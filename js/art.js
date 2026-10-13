/*
 * Rider artwork, drawn onto 256x256 canvases that the game uses as textures.
 *
 * - Rookie: the base practice pilot. A designed character, never presented as a Chog NFT.
 * - NFT rider: the owned Chog's own image, unaltered, framed in a round bubble helmet.
 *   NFT images may have their background baked in, so the whole image is kept (cropped to a
 *   circle) rather than guessing a cutout that could damage traits. See docs/ART.md.
 */
(function (root) {
  const SIZE = 256;

  function newCanvas() {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    return c;
  }

  function drawCollar(g) {
    // Seat collar that ties the rider to the rocket below
    g.fillStyle = "#ff9a3c";
    g.beginPath();
    g.ellipse(128, 236, 74, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#7a3d0c";
    g.lineWidth = 4;
    g.stroke();
  }

  function drawGlass(g, cx, cy, r) {
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, cy, r - 14, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
    g.lineWidth = 9;
    g.strokeStyle = "#d9dde3";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = "#1b2230";
    g.beginPath();
    g.arc(cx, cy, r + 5, 0, Math.PI * 2);
    g.stroke();
  }

  // Base practice pilot: helmet with a closed visor and an antenna. No horns, no Chog face.
  function rookieCanvas() {
    const c = newCanvas(), g = c.getContext("2d");
    drawCollar(g);
    // Antenna
    g.strokeStyle = "#9aa4b2"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(170, 46); g.lineTo(190, 14); g.stroke();
    g.fillStyle = "#ffb84d"; g.beginPath(); g.arc(190, 14, 10, 0, Math.PI * 2); g.fill();
    // Helmet shell
    g.fillStyle = "#eef1f5";
    g.beginPath(); g.arc(128, 124, 100, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#1b2230"; g.stroke();
    // Visor
    g.fillStyle = "#16324a";
    g.beginPath(); g.ellipse(128, 128, 70, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(79,209,197,0.65)";
    g.beginPath(); g.ellipse(104, 108, 24, 12, -0.5, 0, Math.PI * 2); g.fill();
    // Side lights
    g.fillStyle = "#ff9a3c";
    g.beginPath(); g.arc(34, 124, 10, 0, Math.PI * 2); g.arc(222, 124, 10, 0, Math.PI * 2); g.fill();
    return c;
  }

  // The selected Chog's image inside a bubble helmet. The image itself is not redrawn.
  function nftRiderCanvas(img) {
    const c = newCanvas(), g = c.getContext("2d");
    const cx = 128, cy = 116, r = 104;
    drawCollar(g);
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);   // cover the circle
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    g.restore();
    drawGlass(g, cx, cy, r);
    return c;
  }

  // Small soft round dot used for stars and exhaust particles
  function dotCanvas() {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  }

  root.ChogArt = { rookieCanvas, nftRiderCanvas, dotCanvas };
})(window);
