/*
 * Demo mode: try Chog NFT mode without a wallet, with 5 real Chog Genesis NFTs picked for the judging: one per
 * tier (Common, Uncommon, Rare, Epic, Legendary), so every kind of rocket shows up (painted, Skull, Radioactive and a
 * one-of-one), with aura trails and two with Laser Eyes. Metadata is embedded (copied from the collection's tokenURI
 * JSON), so the demo needs no chain calls; the artwork loads from IPFS like any Chog.
 *
 * Demo runs are never submitted to the leaderboard. Quests, badges, the streak and streak lives work exactly as
 * in Chog NFT mode (same rules, js/quests.js), but are kept on this device only. The demo starts on a 6-day
 * streak with 2 streak lives banked, so finishing today's 3 dailies and 5 minutes of flying reaches day 7.
 */
(function (root) {
  const Q = root.ChogQuests;

  const CHOGS = root.ChogDemoChogs;   // js/demo-chogs.js

  const KEY = "chogDashDemo";
  function seed() {
    const t = Date.now(), day = Q.dayNumber(t), log = {};
    for (let d = day - 6; d < day; d++) log[d] = { done: 3, min: 6, counted: true };
    return { quest: null, badges: { streak: { best: 6, first: t } }, streak: { lastDay: day - 1, count: 6 }, log, lives: 2, pin: null };
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    return s && typeof s === "object" ? s : seed();
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  // The Quests screen, the same shape the server returns in Chog NFT mode
  function view() { const s = load(); return Q.questView(s, Date.now(), { pin: s.pin }); }
  // A finished demo run: spends the streak lives it used, then applies quests. Returns what it earned.
  function finish(result) {
    const s = load();
    s.lives = Math.max(0, (s.lives || 0) - (result.bankLivesUsed || 0));
    const out = Q.progressRun(s, Q.runStats(result), Date.now());
    save(Object.assign(out.rec, { pin: s.pin }));
    return out.result;
  }
  function lives() { return load().lives || 0; }
  function setPin(id) {
    const s = load();
    if (id != null && Q.tierIndex(id, s.badges && s.badges[id]) < 0) throw new Error("You haven't earned that badge yet");
    s.pin = id;
    save(s);
    return s.pin;
  }
  function pin() { const s = load(); return s.pin && Q.tierIndex(s.pin, s.badges && s.badges[s.pin]) >= 0 ? s.pin : null; }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  root.ChogDemo = { CHOGS, view, finish, lives, setPin, pin, reset };
})(window);
