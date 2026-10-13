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

  // ---------- Chog NFT seen from behind ----------
  // The NFT image is a front portrait, but in flight the rider faces where the rocket is going, so the
  // camera sees the back of its head. This view is generated per Chog: the headwear shape comes from
  // its Head trait and the colours are sampled from its own image (background, face, headwear, outfit).
  // It is a stand-in for a view the collection doesn't have; the real portrait stays on screen in the HUD.

  const rgb = c => "rgb(" + c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(",") + ")";
  const shade = (c, k) => c.map(v => v * k);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const light = c => (Math.max(...c) + Math.min(...c)) / 510;

  // Most common colour in a region (fractions of the image), ignoring near-black outlines.
  // keep(c) can restrict which colours count.
  function dominant(data, size, x0, y0, x1, y1, keep) {
    const buckets = new Map();
    for (let y = Math.floor(y0 * size); y < Math.ceil(y1 * size); y++) {
      for (let x = Math.floor(x0 * size); x < Math.ceil(x1 * size); x++) {
        const i = (y * size + x) * 4, c = [data[i], data[i + 1], data[i + 2]];
        if (data[i + 3] < 128 || Math.max(...c) < 50 || (keep && !keep(c))) continue;
        const k = (c[0] >> 4) + "," + (c[1] >> 4) + "," + (c[2] >> 4);
        const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += c[0]; b.g += c[1]; b.b += c[2];
        buckets.set(k, b);
      }
    }
    let best = null;
    buckets.forEach(b => { if (!best || b.n > best.n) best = b; });
    return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
  }

  function samplePalette(img, darkFace) {
    const N = 64, c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const bg = dominant(d, N, 0, 0.35, 0.08, 0.7) || dominant(d, N, 0.92, 0.35, 1, 0.7) || [60, 80, 120];
    // Face: the most common light colour around the middle that isn't the background
    // (Skin "Black" Chogs have a dark brown face, so look for a dark colour instead)
    const face = darkFace
      ? dominant(d, N, 0.25, 0.4, 0.75, 0.8, x => light(x) < 0.45 && x[0] > x[2] && dist(x, bg) > 60) || [92, 58, 40]
      : dominant(d, N, 0.2, 0.35, 0.8, 0.85, x => light(x) > 0.55 && dist(x, bg) > 60) || [243, 231, 207];
    const hat = dominant(d, N, 0.3, 0.02, 0.7, 0.2, x => dist(x, bg) > 50) || shade(face, 0.85);
    const outfit = dominant(d, N, 0.3, 0.9, 0.7, 1, x => dist(x, face) > 40) || [60, 60, 70];
    return { bg, face, hat, outfit, hatShown: dist(hat, face) > 45 };
  }

  // Headwear shape from the Head trait value. Unknown values fall back to the image colours.
  function headwearKind(value, pal) {
    const v = String(value || "").toLowerCase();
    const has = (...w) => w.some(x => v.includes(x));
    if (has("bucket")) return "bucket";
    if (has("wizard hat")) return "wizard";
    if (has("russian")) return "fur";
    if (has("beanie")) return "beanie";
    if (has("cap", "mcga", "mega chog", "plumber")) return "cap";
    if (has("crown", "wreath", "thorn", "seal")) return "crown";
    if (has("horn")) return "horns";
    if (has("durag")) return "durag";
    if (has("headband", "bandana", "wrap")) return "band";
    if (has("hair", "wig")) return "hair";
    if (has("helmet")) return "helmet";
    if (has("hat")) return "bucket";
    return v ? "bare" : (pal.hatShown ? "beanie" : "bare");
  }

  // view: "back" (in flight) or "threeQuarter" (home screen: turned a little left, like Rookie)
  function chogBackCanvas(img, attributes, view) {
    const attr = name => {
      const a = (attributes || []).find(x => String(x.trait_type).trim().toLowerCase() === name);
      return a ? String(a.value).trim().toLowerCase() : "";
    };
    const pal = samplePalette(img, attr("skin") === "black");
    const kind = headwearKind(attr("head"), pal);
    const tq = view === "threeQuarter";
    const c = newCanvas(), g = c.getContext("2d"), pen = rookiePen(g), INK = pen.INK;
    const cx = 128, cy = 116, r = 104;
    const face = rgb(pal.face), hat = rgb(pal.hat), hatDark = rgb(shade(pal.hat, 0.72));
    const sx = tq ? 8 : 0;   // seams and strap shift right when the head turns left

    drawCollar(g);
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = rgb(pal.bg); g.fillRect(0, 0, SIZE, SIZE);
    g.translate(0, -18);   // fit head and shoulders inside the helmet

    // Shoulders in the outfit colour, collar line
    pen.shape(rgb(pal.outfit), () => { g.moveTo(30, 260); g.quadraticCurveTo(36, 206, 84, 196); g.lineTo(172, 196); g.quadraticCurveTo(220, 206, 226, 260); g.closePath(); });
    pen.shape(rgb(shade(pal.outfit, 0.8)), () => { g.moveTo(96, 194); g.lineTo(160, 194); g.lineTo(156, 206); g.lineTo(100, 206); g.closePath(); });

    // Head with the Chog's pink cheeks peeking out (one cheek and eye edge in the three-quarter view)
    pen.shape(face, () => { g.ellipse(128 + sx * 0.25, 150, 84, 66, 0, 0, Math.PI * 2); });
    g.save();
    g.beginPath(); g.ellipse(128 + sx * 0.25, 150, 81, 63, 0, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#e2547e";
    if (tq) {
      g.beginPath(); g.arc(56, 178, 16, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(206, 178, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(52, 144, 14, 16, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(46, 145, 10, 0, Math.PI * 2); g.fill();
    } else {
      g.beginPath(); g.arc(48, 176, 12, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(208, 176, 12, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    const dome = (top, bottom) => pen.shape(hat, () => {
      g.moveTo(44, bottom); g.quadraticCurveTo(46, top, 128, top - 4); g.quadraticCurveTo(210, top, 212, bottom); g.quadraticCurveTo(128, bottom - 18, 44, bottom); g.closePath();
    });
    const seams = top => {
      g.strokeStyle = "rgba(21,21,21,0.5)"; g.lineWidth = 3;
      [[78 + sx * 2, 122], [178 + sx, 122]].forEach(([x, y]) => { g.beginPath(); g.moveTo(128 + sx, top); g.quadraticCurveTo((128 + x) / 2, 60, x, y); g.stroke(); });
    };

    if (kind === "cap") {
      if (tq) pen.shape(hatDark, () => { g.moveTo(70, 100); g.quadraticCurveTo(26, 84, 2, 96); g.quadraticCurveTo(18, 116, 66, 120); g.closePath(); });
      dome(22, 130); seams(22);
      pen.shape(face, () => { g.moveTo(100 + sx * 3, 126); g.quadraticCurveTo(100 + sx * 3, 94, 128 + sx * 3, 92); g.quadraticCurveTo(156 + sx * 3, 94, 156 + sx * 3, 126); g.closePath(); });
      pen.shape(hatDark, () => { g.rect(94 + sx * 3, 112, 68, 10); });
      pen.shape(hatDark, () => { g.arc(128 + sx, 20, 7, 0, Math.PI * 2); });
    } else if (kind === "bucket") {
      pen.shape(hatDark, () => { g.ellipse(128, 120, 112, 26, 0, 0, Math.PI * 2); });
      pen.shape(hat, () => { g.moveTo(58, 122); g.quadraticCurveTo(60, 30, 128, 28); g.quadraticCurveTo(196, 30, 198, 122); g.quadraticCurveTo(128, 108, 58, 122); g.closePath(); });
      pen.shape(hatDark, () => { g.moveTo(60, 112); g.quadraticCurveTo(128, 98, 196, 112); g.lineTo(197, 122); g.quadraticCurveTo(128, 108, 59, 122); g.closePath(); });
    } else if (kind === "beanie") {
      dome(26, 124); seams(26);
      pen.shape(hatDark, () => { g.moveTo(44, 124); g.quadraticCurveTo(128, 104, 212, 124); g.lineTo(212, 142); g.quadraticCurveTo(128, 122, 44, 142); g.closePath(); });
      g.strokeStyle = "rgba(21,21,21,0.35)"; g.lineWidth = 2;
      for (let x = 56; x < 204; x += 12) { g.beginPath(); g.moveTo(x, 120 - Math.sin((x - 44) / 168 * Math.PI) * 14); g.lineTo(x, 138 - Math.sin((x - 44) / 168 * Math.PI) * 14); g.stroke(); }
    } else if (kind === "fur") {
      pen.shape(hat, () => { g.moveTo(40, 132); g.lineTo(46, 40); g.quadraticCurveTo(128, 18, 210, 40); g.lineTo(216, 132); g.quadraticCurveTo(128, 112, 40, 132); g.closePath(); });
      g.fillStyle = "rgba(255,255,255,0.18)";
      for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(52 + Math.random() * 152, 40 + Math.random() * 84, 3 + Math.random() * 4, 0, Math.PI * 2); g.fill(); }
      pen.shape(hatDark, () => { g.moveTo(40, 132); g.quadraticCurveTo(128, 112, 216, 132); g.lineTo(214, 112); g.quadraticCurveTo(128, 94, 42, 112); g.closePath(); });
    } else if (kind === "wizard") {
      pen.shape(hatDark, () => { g.ellipse(128, 118, 110, 22, 0, 0, Math.PI * 2); });
      pen.shape(hat, () => { g.moveTo(66, 116); g.quadraticCurveTo(110, 60, 150 + sx, -10); g.quadraticCurveTo(160, 60, 192, 116); g.quadraticCurveTo(128, 104, 66, 116); g.closePath(); });
    } else if (kind === "crown") {
      dome(40, 120);   // hair/head top in the sampled colour would hide the crown, so the band sits on the head
      pen.shape(hat, () => { g.moveTo(66, 104); g.lineTo(70, 46); g.lineTo(92, 78); g.lineTo(110, 34); g.lineTo(128, 72); g.lineTo(146, 34); g.lineTo(164, 78); g.lineTo(186, 46); g.lineTo(190, 104); g.quadraticCurveTo(128, 92, 66, 104); g.closePath(); });
    } else if (kind === "horns") {
      [[84, -1], [172, 1]].forEach(([x, d]) => pen.shape(hat, () => { g.moveTo(x - 16, 98); g.quadraticCurveTo(x + d * 6, 40, x + d * 26, 22); g.quadraticCurveTo(x + d * 20, 60, x + 16, 96); g.closePath(); }));
    } else if (kind === "durag") {
      dome(28, 128);
      pen.shape(hat, () => { g.moveTo(116, 120); g.quadraticCurveTo(110, 190, 96, 214); g.lineTo(118, 214); g.quadraticCurveTo(128, 170, 134, 120); g.closePath(); });
      pen.shape(hat, () => { g.moveTo(128, 120); g.quadraticCurveTo(140, 190, 152, 212); g.lineTo(170, 206); g.quadraticCurveTo(150, 170, 144, 120); g.closePath(); });
    } else if (kind === "band") {
      pen.shape(hat, () => { g.moveTo(46, 122); g.quadraticCurveTo(128, 96, 210, 122); g.lineTo(210, 142); g.quadraticCurveTo(128, 116, 46, 142); g.closePath(); });
      pen.shape(hat, () => { g.moveTo(124, 120); g.quadraticCurveTo(112, 160, 98, 176); g.lineTo(116, 180); g.quadraticCurveTo(128, 156, 136, 122); g.closePath(); });
    } else if (kind === "hair") {
      pen.shape(hat, () => {
        g.moveTo(40, 160);
        for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI, x = 128 + Math.cos(a) * 92, y = 120 + Math.sin(a) * 92; g.quadraticCurveTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16, x, y); }
        g.lineTo(216, 160); g.quadraticCurveTo(128, 130, 40, 160); g.closePath();
      });
    } else if (kind === "helmet") {
      dome(24, 140);
      pen.shape(rgb(shade(pal.hat, 0.6)), () => { g.moveTo(118, 8); g.quadraticCurveTo(128, -4, 138, 8); g.lineTo(136, 116); g.lineTo(120, 116); g.closePath(); });
    }
    pen.grain();
    g.restore();
    drawGlass(g, cx, cy, r);
    c.kind = kind;
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

  root.ChogArt = { rookieCanvas, rookieThreeQuarterCanvas, rookieBackCanvas, nftRiderCanvas, chogBackCanvas, samplePalette, headwearKind, dotCanvas };
})(window);
