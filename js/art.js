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

  // Base practice pilot "Rookie": drawn in the Chog art style (cream face, pink cheeks, big glossy eyes,
  // cap and tracksuit, thick outlines) but with its own amber cap, ROOKIE badge and teal tracksuit, so it
  // is never mistaken for any real Chog Genesis NFT. Transparent background so it sits in the rocket seat.
  function rookieCanvas() {
    const c = newCanvas(), g = c.getContext("2d");
    const INK = "#151515", OUT = 6;
    g.lineJoin = "round"; g.lineCap = "round";
    const shape = (fill, draw) => { g.beginPath(); draw(); g.fillStyle = fill; g.fill(); g.lineWidth = OUT; g.strokeStyle = INK; g.stroke(); };

    // Tracksuit (shoulders sit down into the rocket seat)
    shape("#22a597", () => {
      g.moveTo(26, 256); g.quadraticCurveTo(34, 206, 84, 196); g.lineTo(172, 196);
      g.quadraticCurveTo(222, 206, 230, 256); g.closePath();
    });
    g.strokeStyle = "#f4f4f4"; g.lineWidth = 5;
    [[70, 204, 44, 256], [82, 202, 58, 256], [186, 204, 212, 256], [174, 202, 198, 256]].forEach(([a, b, x, y]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(x, y); g.stroke(); });
    g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.moveTo(128, 204); g.lineTo(128, 256); g.stroke();
    g.strokeStyle = "#f4f4f4"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(132, 206); g.lineTo(132, 256); g.stroke();
    // Collar
    shape("#1b8c80", () => { g.moveTo(96, 194); g.lineTo(128, 214); g.lineTo(160, 194); g.lineTo(150, 186); g.lineTo(106, 186); g.closePath(); });

    // Head
    shape("#f3e7cf", () => { g.ellipse(128, 150, 84, 66, 0, 0, Math.PI * 2); });
    // Cheeks and nose
    g.fillStyle = "#e2547e";
    g.beginPath(); g.arc(78, 172, 17, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(190, 166, 13, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(144, 152); g.quadraticCurveTo(160, 150, 156, 162); g.quadraticCurveTo(148, 168, 144, 152); g.fill();
    // Big glossy eyes, glancing to the side
    const eye = (x, y, rx, ry, pr) => {
      shape("#ffffff", () => { g.ellipse(x, y, rx, ry, -0.12, 0, Math.PI * 2); });
      g.fillStyle = INK; g.beginPath(); g.arc(x + rx * 0.28, y + 1, pr, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath(); g.arc(x + rx * 0.42, y - pr * 0.4, pr * 0.34, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + rx * 0.1, y + pr * 0.45, pr * 0.16, 0, Math.PI * 2); g.fill();
    };
    eye(102, 144, 25, 19, 15);
    eye(178, 140, 16, 14, 10);
    // Mouth
    g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.moveTo(148, 190); g.lineTo(166, 186); g.stroke();

    // Cap: dome, panel seam and a brim angled to the right
    shape("#ff9a3c", () => { g.moveTo(46, 116); g.quadraticCurveTo(50, 26, 130, 20); g.quadraticCurveTo(206, 22, 210, 96); g.quadraticCurveTo(130, 90, 46, 116); g.closePath(); });
    g.strokeStyle = "rgba(21,21,21,0.55)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 22); g.quadraticCurveTo(104, 60, 98, 100); g.stroke();
    shape("#d9681c", () => { g.moveTo(104, 98); g.quadraticCurveTo(186, 82, 242, 106); g.quadraticCurveTo(206, 122, 108, 114); g.closePath(); });
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(124, 102); g.quadraticCurveTo(186, 92, 228, 106); g.stroke();
    // ROOKIE badge on the cap front
    g.save();
    g.translate(118, 62); g.rotate(-0.1);
    g.beginPath(); g.roundRect ? g.roundRect(-42, -14, 84, 28, 8) : g.rect(-42, -14, 84, 28);
    g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.fillStyle = "#1b8c80"; g.font = "bold 17px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("ROOKIE", 0, 1);
    g.restore();

    // Light grain over the drawing only, like printed paper
    g.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    g.globalCompositeOperation = "source-over";
    return c;
  }

  // Shared helpers for the Rookie views
  function rookiePen(g) {
    const INK = "#151515";
    g.lineJoin = "round"; g.lineCap = "round";
    return {
      INK,
      shape(fill, draw) { g.beginPath(); draw(); g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); },
      grain() {
        g.globalCompositeOperation = "source-atop";
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)";
          g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
        }
        g.globalCompositeOperation = "source-over";
      },
    };
  }

  // Rookie from behind, turned a little to the left: used on the home screen, where the rocket points
  // away into the screen and up-left. The cap brim pokes out on the left and one cheek and eye just show.
  function rookieThreeQuarterCanvas() {
    const c = newCanvas(), g = c.getContext("2d"), pen = rookiePen(g), INK = pen.INK;
    // Tracksuit back
    pen.shape("#22a597", () => { g.moveTo(26, 256); g.quadraticCurveTo(34, 206, 84, 196); g.lineTo(176, 196); g.quadraticCurveTo(226, 206, 232, 256); g.closePath(); });
    g.strokeStyle = "#f4f4f4"; g.lineWidth = 5;
    [[70, 204, 44, 256], [82, 202, 58, 256], [190, 204, 216, 256], [178, 202, 202, 256]].forEach(([a, b, x, y]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(x, y); g.stroke(); });
    pen.shape("#1b8c80", () => { g.moveTo(92, 194); g.lineTo(162, 194); g.lineTo(158, 206); g.lineTo(96, 206); g.closePath(); });
    g.fillStyle = "#f4f4f4"; g.font = "bold 20px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("ROOKIE", 138, 232);
    // Head, with the left cheek and the edge of the left eye just in view
    pen.shape("#f3e7cf", () => { g.ellipse(130, 150, 84, 66, 0, 0, Math.PI * 2); });
    g.save();
    g.beginPath(); g.ellipse(130, 150, 81, 63, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#e2547e"; g.beginPath(); g.arc(56, 178, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(52, 144, 14, 16, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(46, 145, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(44, 140, 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e2547e"; g.beginPath(); g.arc(206, 178, 9, 0, Math.PI * 2); g.fill();
    g.restore();
    // Brim on the far side, pointing up and to the left (drawn first so the dome overlaps it)
    pen.shape("#d9681c", () => { g.moveTo(70, 100); g.quadraticCurveTo(26, 84, 2, 96); g.quadraticCurveTo(18, 116, 66, 120); g.closePath(); });
    // Cap dome from behind-left, seams, snapback opening and strap
    pen.shape("#ff9a3c", () => { g.moveTo(44, 128); g.quadraticCurveTo(44, 22, 124, 18); g.quadraticCurveTo(212, 20, 216, 130); g.quadraticCurveTo(130, 112, 44, 128); g.closePath(); });
    g.strokeStyle = "rgba(21,21,21,0.55)"; g.lineWidth = 3;
    [[96, 122], [196, 124]].forEach(([x, y]) => { g.beginPath(); g.moveTo(124, 22); g.quadraticCurveTo((124 + x) / 2 + 6, 60, x, y); g.stroke(); });
    pen.shape("#f3e7cf", () => { g.moveTo(124, 126); g.quadraticCurveTo(124, 94, 150, 92); g.quadraticCurveTo(176, 94, 176, 126); g.closePath(); });
    pen.shape("#d9681c", () => { g.rect(118, 112, 64, 10); });
    g.fillStyle = INK;
    [132, 144, 156, 168].forEach(x => { g.beginPath(); g.arc(x, 117, 1.8, 0, Math.PI * 2); g.fill(); });
    pen.shape("#d9681c", () => { g.arc(124, 20, 7, 0, Math.PI * 2); });
    pen.grain();
    return c;
  }

  // Rookie from behind, looking where the rocket is flying
  function rookieBackCanvas() {
    const c = newCanvas(), g = c.getContext("2d"), pen = rookiePen(g), INK = pen.INK;
    // Tracksuit back with ROOKIE across the shoulders
    pen.shape("#22a597", () => { g.moveTo(26, 256); g.quadraticCurveTo(34, 206, 84, 196); g.lineTo(172, 196); g.quadraticCurveTo(222, 206, 230, 256); g.closePath(); });
    g.strokeStyle = "#f4f4f4"; g.lineWidth = 5;
    [[70, 204, 44, 256], [82, 202, 58, 256], [186, 204, 212, 256], [174, 202, 198, 256]].forEach(([a, b, x, y]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(x, y); g.stroke(); });
    pen.shape("#1b8c80", () => { g.moveTo(96, 194); g.lineTo(160, 194); g.lineTo(156, 206); g.lineTo(100, 206); g.closePath(); });
    g.fillStyle = "#f4f4f4"; g.font = "bold 20px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("ROOKIE", 128, 232);
    // Back of the head, cheeks just peeking out at the sides
    pen.shape("#f3e7cf", () => { g.ellipse(128, 150, 84, 66, 0, 0, Math.PI * 2); });
    g.save();
    g.beginPath(); g.ellipse(128, 150, 81, 63, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#e2547e";
    g.beginPath(); g.arc(48, 176, 12, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(208, 176, 12, 0, Math.PI * 2); g.fill();
    g.restore();
    // Cap from behind: dome, seams to the top button, snapback opening and strap
    pen.shape("#ff9a3c", () => { g.moveTo(44, 130); g.quadraticCurveTo(46, 22, 128, 18); g.quadraticCurveTo(210, 22, 212, 130); g.quadraticCurveTo(128, 112, 44, 130); g.closePath(); });
    g.strokeStyle = "rgba(21,21,21,0.55)"; g.lineWidth = 3;
    [[78, 122], [178, 122]].forEach(([x, y]) => { g.beginPath(); g.moveTo(128, 22); g.quadraticCurveTo((128 + x) / 2, 60, x, y); g.stroke(); });
    pen.shape("#f3e7cf", () => { g.moveTo(100, 126); g.quadraticCurveTo(100, 94, 128, 92); g.quadraticCurveTo(156, 94, 156, 126); g.closePath(); });
    pen.shape("#d9681c", () => { g.rect(94, 112, 68, 10); });
    g.fillStyle = INK;
    [108, 120, 132, 144].forEach(x => { g.beginPath(); g.arc(x, 117, 1.8, 0, Math.PI * 2); g.fill(); });
    pen.shape("#d9681c", () => { g.arc(128, 20, 7, 0, Math.PI * 2); });
    pen.grain();
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

  root.ChogArt = { rookieCanvas, rookieThreeQuarterCanvas, rookieBackCanvas, nftRiderCanvas, dotCanvas };
})(window);
