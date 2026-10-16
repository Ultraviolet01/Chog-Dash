/*
 * Pool admin page (admin.html): the pool owner deploys the pool contract, registers it with the game server,
 * reviews each finished week's top 10 (and can disqualify a player), and pays the winners. Every transaction is
 * signed in the owner's own wallet.
 */
(function () {
  const cfg = window.ChogConfig, Chain = window.ChogChain, TKT = window.ChogTickets, ART = window.ChogPoolArtifact;
  const $ = id => document.getElementById(id);
  const S = { provider: null, account: null, token: null, pool: null, week: null, results: null };
  const explorer = cfg.collection.explorerUrls[0];
  const short = a => a.slice(0, 6) + "..." + a.slice(-4);
  const link = (kind, v) => '<a target="_blank" rel="noopener" href="' + explorer + "/" + kind + "/" + v + '">' + short(v) + "</a>";
  const chog = wei => (wei == null ? "-" : TKT.format(wei, 2) + " CHOG");
  const when = ms => new Date(ms).toUTCString().replace(" GMT", " UTC");
  function status(id, text, kind) { $(id).textContent = text; $(id).className = "status" + (kind ? " " + kind : ""); }

  async function api(path, body) {
    const opts = { method: body ? "POST" : "GET", headers: {} };
    if (body) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    if (S.token) opts.headers.authorization = "Bearer " + S.token;
    const res = await fetch(cfg.leaderboard.apiBase + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || "Server error " + res.status);
    return data;
  }
  const hex = s => "0x" + Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, "0")).join("");
  const walletError = e => (e && (e.code === 4001 || /rejected|denied/i.test(e.message || "")) ? "Cancelled in your wallet." : (e && e.message) || String(e));

  // ---------- 1. Wallet ----------
  function listWallets() {
    const box = $("wallets"); box.innerHTML = "";
    const ws = Chain.listWallets().filter(w => w.provider);
    if (!ws.length) { status("walletStatus", "No MetaMask, Rabby or Phantom wallet found in this browser.", "err"); return; }
    ws.forEach(w => { const b = document.createElement("button"); b.className = "ghost"; b.textContent = "Connect " + w.name; b.onclick = () => connect(w.provider); box.appendChild(b); });
  }
  async function connect(provider) {
    try {
      const r = await Chain.connect(provider);
      S.provider = provider; S.account = r.account;
      if (r.chainId !== cfg.collection.chainId) { status("walletStatus", "Switching to Monad..."); await Chain.switchToMonad(provider); }
      status("walletStatus", "Sign the message in your wallet (free, no transaction)...");
      const n = await api("/auth/nonce", { wallet: S.account });
      const signature = await provider.request({ method: "personal_sign", params: [hex(n.message), S.account] });
      S.token = (await api("/auth/verify", { wallet: S.account, message: n.message, signature })).token;
      await loadPool();
    } catch (e) { status("walletStatus", walletError(e), "err"); }
  }

  // ---------- 2. Pool contract ----------
  async function loadPool() {
    S.pool = await api("/pool");
    const admin = S.pool.admin;
    if (!admin) { status("walletStatus", "Signed in as " + S.account + ". The server has no pool owner yet: set POOL_ADMIN to this address in Vercel (Settings > Environment Variables), redeploy, then reload this page.", "err"); return; }
    if (admin !== S.account) { status("walletStatus", "Signed in as " + S.account + ", but the pool owner (POOL_ADMIN) is " + admin + ". Connect that wallet instead.", "err"); return; }
    status("walletStatus", "Signed in as the pool owner " + S.account + " on Monad.", "ok");
    $("contractBox").classList.remove("hidden");
    $("deployBox").classList.toggle("hidden", !!S.pool.enabled);
    $("contractInfo").innerHTML = S.pool.enabled
      ? "<span>Contract</span><b>" + link("address", S.pool.address) + "</b><span>Token</span><b>" + link("token", S.pool.token) + " ($CHOG)</b>" +
        "<span>This week's pool</span><b>" + chog(S.pool.current) + "</b><span>Ticket price</span><b>" + (S.pool.perTicket ? chog(S.pool.perTicket) + " ($" + S.pool.priceUsd + ")" : "price unavailable") + "</b>" +
        "<span>Week resets</span><b>" + when(S.pool.weekEndsAt) + "</b>"
      : "<span>Status</span><b>Not deployed</b>";
    if (S.pool.enabled) { $("weekBox").classList.remove("hidden"); showWeek(S.week == null ? S.pool.week - 1 : S.week); }
  }
  async function deploy() {
    $("deployBtn").disabled = true;
    try {
      status("contractStatus", "Confirm the contract creation in your wallet...");
      const hash = await TKT.deploy(S.provider, S.account, ART.bytecode);
      status("contractStatus", "Deploying... " + hash);
      const receipt = await TKT.wait(S.provider, hash);
      if (!receipt.contractAddress) throw new Error("No contract address in the receipt");
      await register(receipt.contractAddress);
    } catch (e) { status("contractStatus", walletError(e), "err"); }
    $("deployBtn").disabled = false;
  }
  async function register(address) {
    status("contractStatus", "Registering " + address + " with the game...");
    try {
      await api("/pool/register", { address });
      status("contractStatus", "Pool contract live at " + address + ". Tickets are on sale in the game.", "ok");
      await loadPool();
    } catch (e) { status("contractStatus", e.message, "err"); }
  }

  // ---------- 3. Weekly results ----------
  async function showWeek(week) {
    S.week = week;
    $("weekLabel").textContent = "Week " + week;
    $("nextWeek").disabled = week >= S.pool.week - 1;
    status("weekStatus", "Loading...");
    const r = S.results = await api("/pool/results?week=" + week);
    $("weekLabel").textContent = "Week of " + new Date(r.startsAt).toUTCString().slice(5, 16);
    const state = r.paid ? '<span class="tag ok">PAID</span>' : !r.ended ? '<span class="tag">RUNNING</span>'
      : r.payable ? '<span class="tag warn">READY TO PAY</span>' : r.winners.length ? '<span class="tag">IN REVIEW</span>' : '<span class="tag">NO PLAYERS</span>';
    $("weekInfo").innerHTML = "<span>Status</span><b>" + state + "</b><span>Runs</span><b>" + when(r.startsAt) + " to " + when(r.endsAt) + "</b>" +
      "<span>Review ends</span><b>" + when(r.reviewEndsAt) + "</b><span>Can pay</span><b>" + chog(r.available) + "</b>";
    const tb = $("winners"); tb.innerHTML = "";
    r.winners.forEach(w => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + w.rank + "</td><td>" + (w.username || "-") + "</td><td>" + link("address", w.wallet) + '</td><td class="num">' + w.total.toLocaleString() +
        ' m</td><td class="num">' + w.share + '%</td><td class="num">' + chog(w.amount) + "</td><td></td>";
      if (!r.paid && r.ended) {
        const b = document.createElement("button"); b.className = "ghost"; b.textContent = "Disqualify";
        b.onclick = () => disqualify(w); tr.lastChild.appendChild(b);
      }
      tb.appendChild(tr);
    });
    if (!r.winners.length) tb.innerHTML = '<tr><td colspan="7" class="note">No ranked runs this week.</td></tr>';
    $("payBtn").disabled = !r.payable;
    $("skipBtn").disabled = !(r.ended && !r.paid && !r.winners.length && week > 0);
    const total = r.winners.reduce((a, w) => a + BigInt(w.amount || 0), 0n);
    status("weekStatus", r.paid ? "This week has been paid." : !r.ended ? "This week is still running."
      : r.payable ? "Pays " + chog(total) + " to " + r.winners.length + " winner" + (r.winners.length === 1 ? "" : "s") + "; " + chog(BigInt(r.available || 0) - total) + " rolls over to next week."
      : r.winners.length ? "Results are in review until " + when(r.reviewEndsAt) + ". Check them, disqualify any cheats, then pay." : "Nobody played: skip it so its pool rolls over.");
    $("dqList").textContent = r.disqualified.length ? "Disqualified: " + r.disqualified.map(d => short(d.wallet) + (d.reason ? " (" + d.reason + ")" : "")).join(", ") : "";
  }
  async function disqualify(w) {
    const reason = window.prompt("Disqualify " + (w.username || w.wallet) + " from this week? Reason:", "");
    if (reason == null) return;
    try { await api("/pool/disqualify", { week: S.week, wallet: w.wallet, reason }); await showWeek(S.week); }
    catch (e) { status("weekStatus", e.message, "err"); }
  }
  async function pay() {
    const r = S.results;
    if (!r || !r.payable) return;
    $("payBtn").disabled = true;
    try {
      const ws = r.winners.filter(w => BigInt(w.amount) > 0n);
      status("weekStatus", "Confirm the payout to " + ws.length + " winners in your wallet...");
      const hash = await TKT.payWinners(S.provider, S.account, S.pool.address, r.week, ws.map(w => w.wallet), ws.map(w => BigInt(w.amount)));
      status("weekStatus", "Paying... " + hash);
      await TKT.wait(S.provider, hash);
      status("weekStatus", "Paid. Transaction " + hash, "ok");
      await showWeek(S.week);
    } catch (e) { status("weekStatus", walletError(e), "err"); $("payBtn").disabled = false; }
  }
  async function skip() {
    try {
      const hash = await TKT.skipWeek(S.provider, S.account, S.pool.address, S.week);
      status("weekStatus", "Skipping... " + hash);
      await TKT.wait(S.provider, hash);
      await showWeek(S.week);
    } catch (e) { status("weekStatus", walletError(e), "err"); }
  }

  $("deployBtn").onclick = deploy;
  $("registerBtn").onclick = () => register($("existingAddr").value.trim());
  $("prevWeek").onclick = () => showWeek(S.week - 1);
  $("nextWeek").onclick = () => showWeek(S.week + 1);
  $("payBtn").onclick = pay;
  $("skipBtn").onclick = skip;
  window.addEventListener("eip6963:announceProvider", () => setTimeout(listWallets, 50));
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  setTimeout(listWallets, 300);
})();
