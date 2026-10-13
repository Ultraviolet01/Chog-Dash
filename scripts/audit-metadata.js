/*
 * Audits every Chog Genesis token's metadata and checks it against the gameplay mapping.
 *
 *   node scripts/audit-metadata.js                  token IDs from data/contract-report.json, metadata via tokenURI
 *   node scripts/audit-metadata.js --from 1 --to 1969
 *   node scripts/audit-metadata.js --folder         read ipfs://<metadataCid>/<id> directly instead of tokenURI
 *
 * Output:
 *   data/collection-audit.json   full inventory (trait types, values, counts, per-token results)
 *   docs/TRAIT-AUDIT.md          readable report, including unmapped and ambiguous values
 *   data/metadata-cache/         raw metadata per token (git-ignored), so reruns are fast
 */
const fs = require("fs");
const path = require("path");
const { createPublicClient, http, parseAbi } = require("viem");
const config = require("../js/config.js");
const Traits = require("../js/traits.js");
const Meta = require("../js/metadata.js");

const C = config.collection;
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const useFolder = args.includes("--folder");
const DATA = path.join(__dirname, "../data");
const CACHE = path.join(DATA, "metadata-cache");

function idRange() {
  if (arg("--from") && arg("--to")) return [Number(arg("--from")), Number(arg("--to"))];
  try {
    const r = JSON.parse(fs.readFileSync(path.join(DATA, "contract-report.json"))).tokenIdRange;
    if (r) return [r.first, r.last];
  } catch (e) {}
  throw new Error("No token ID range. Run scripts/verify-contract.js first, or pass --from and --to.");
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function main() {
  const [from, to] = idRange();
  const ids = []; for (let id = from; id <= to; id++) ids.push(id);
  fs.mkdirSync(CACHE, { recursive: true });
  const client = useFolder ? null : createPublicClient({ transport: http(process.env.MONAD_RPC_URL || C.rpcUrls[0], { timeout: 15000 }) });
  const abi = parseAbi(["function tokenURI(uint256) view returns (string)"]);

  const tokens = {}, failures = [];
  let done = 0;
  await pool(ids, 8, async id => {
    const cacheFile = path.join(CACHE, id + ".json");
    try {
      let entry;
      if (fs.existsSync(cacheFile)) entry = JSON.parse(fs.readFileSync(cacheFile));
      else {
        const uri = useFolder ? "ipfs://" + C.metadataCid + "/" + id
          : await client.readContract({ address: C.contract, abi, functionName: "tokenURI", args: [BigInt(id)] });
        const { json, url } = await Meta.fetchJson(uri);
        entry = { id, tokenURI: uri, fetchedFrom: url, metadata: json };
        fs.writeFileSync(cacheFile, JSON.stringify(entry));
      }
      tokens[id] = entry;
    } catch (e) {
      failures.push({ id, error: (e.shortMessage || e.message).split("\n")[0] });
    }
    if (++done % 100 === 0) console.log(done + "/" + ids.length);
  });

  // Inventory
  const traitTypes = {};             // trait_type (original) -> { value (original) -> count }
  const results = [];
  const tierCounts = {}, abilityCounts = {}, imageIssues = [], metaProblems = [];
  for (const id of ids) {
    const t = tokens[id];
    if (!t) continue;
    const gp = Traits.resolveGameplay(t.metadata);
    gp.attributes.forEach(a => {
      traitTypes[a.trait_type] = traitTypes[a.trait_type] || {};
      traitTypes[a.trait_type][a.value] = (traitTypes[a.trait_type][a.value] || 0) + 1;
    });
    if (gp.problems.length || gp.notes.length) metaProblems.push({ id, problems: gp.problems, notes: gp.notes });
    const img = t.metadata && t.metadata.image;
    if (!img) imageIssues.push({ id, issue: "no image" });
    else if (!String(img).includes(C.imageCid)) imageIssues.push({ id, issue: "image not in expected image CID", image: img });
    const tierKey = gp.tier == null ? "(missing)" : gp.tier;
    tierCounts[tierKey] = (tierCounts[tierKey] || 0) + 1;
    gp.abilities.forEach(a => { abilityCounts[a.id] = (abilityCounts[a.id] || 0) + 1; });
    results.push({ id, name: t.metadata && t.metadata.name, tier: gp.tier, multiplier: gp.multiplier,
      abilities: gp.abilities.map(a => a.id + " (" + a.fromValue + ")") });
  }

  // Mapping review: every value of each ability trait, whether it matched, and look-alikes to check by hand
  const review = {};
  for (const [abilityId, rule] of Object.entries(config.abilities)) {
    const typeKey = Object.keys(traitTypes).find(k => k.trim().toLowerCase() === rule.trait.toLowerCase());
    const values = typeKey ? traitTypes[typeKey] : {};
    review[abilityId] = Object.entries(values).sort((a, b) => b[1] - a[1]).map(([value, count]) => {
      const n = value.trim().toLowerCase();
      const mapped = Traits.matchesRule(n, rule.match);
      const lookAlike = !mapped && /las|lazer|beam|ray|zap/.test(n);
      return { value, count, mapped, needsReview: lookAlike };
    });
  }

  // Representative tokens for testing: per tier, one with and one without each ability
  const samples = [];
  for (const tier of Object.keys(tierCounts)) {
    for (const want of [true, false]) {
      const r = results.find(x => (x.tier == null ? "(missing)" : x.tier) === tier && (x.abilities.length > 0) === want);
      if (r) samples.push(r);
    }
  }

  const complete = failures.length === 0;
  const audit = {
    generatedAt: new Date().toISOString(), source: useFolder ? "metadata folder CID" : "tokenURI",
    range: { from, to }, expected: ids.length, loaded: Object.keys(tokens).length, complete, failures,
    traitTypes, tierCounts, abilityCounts, mappingReview: review, imageIssues, metaProblems, samples, tokens: results,
  };
  fs.writeFileSync(path.join(DATA, "collection-audit.json"), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(__dirname, "../docs/TRAIT-AUDIT.md"), renderReport(audit));
  console.log("Loaded " + audit.loaded + " of " + audit.expected + (complete ? " (complete)" : " (INCOMPLETE)"));
  console.log("Saved data/collection-audit.json and docs/TRAIT-AUDIT.md");
}

function renderReport(a) {
  const L = [];
  L.push("# Chog Genesis trait audit", "");
  L.push("- Generated: " + a.generatedAt + " (source: " + a.source + ")");
  L.push("- Tokens loaded: " + a.loaded + " of " + a.expected + (a.complete ? " (complete)" : " (INCOMPLETE: results below are not final)"));
  if (a.failures.length) L.push("- Failed token IDs: " + a.failures.map(f => f.id).join(", "));
  L.push("- Abilities and tier multipliers are Chog Dash game-design decisions, not official collection rules.", "");
  L.push("## Tier counts", "", "| Tier (original) | Tokens | Multiplier |", "|---|---:|---:|");
  for (const [t, c] of Object.entries(a.tierCounts)) {
    const m = config.tiers.multipliers[String(t).trim().toLowerCase()];
    L.push("| " + t + " | " + c + " | " + (m != null ? m.toFixed(2) + "x" : "unmapped, " + config.tiers.unknownMultiplier.toFixed(2) + "x") + " |");
  }
  L.push("", "## Ability mapping review", "");
  for (const [id, rows] of Object.entries(a.mappingReview)) {
    const rule = config.abilities[id];
    L.push("### " + rule.label + " (trait: " + rule.trait + ")", "");
    L.push("- Rule: contains " + JSON.stringify(rule.match.contains) + ", exact " + JSON.stringify(rule.match.exact));
    L.push("- Tokens with this ability: " + (a.abilityCounts[id] || 0), "");
    L.push("| Value (original) | Tokens | Mapped | Needs review |", "|---|---:|---|---|");
    rows.forEach(r => L.push("| " + r.value + " | " + r.count + " | " + (r.mapped ? "yes" : "no") + " | " + (r.needsReview ? "yes" : "") + " |"));
    L.push("");
  }
  L.push("## All trait types and values", "");
  for (const [type, values] of Object.entries(a.traitTypes)) {
    L.push("### " + type + " (" + Object.keys(values).length + " values)", "");
    L.push(Object.entries(values).sort((x, y) => y[1] - x[1]).map(([v, c]) => "- " + v + ": " + c).join("\n"), "");
  }
  L.push("## Problems", "");
  L.push("- Image issues: " + a.imageIssues.length);
  a.imageIssues.slice(0, 50).forEach(i => L.push("  - Token " + i.id + ": " + i.issue + (i.image ? " (" + i.image + ")" : "")));
  L.push("- Metadata problems or notes: " + a.metaProblems.length);
  a.metaProblems.slice(0, 50).forEach(p => L.push("  - Token " + p.id + ": " + p.problems.concat(p.notes).join("; ")));
  L.push("", "## Representative tokens for testing", "");
  a.samples.forEach(s => L.push("- Token " + s.id + " (" + s.name + "): Tier " + s.tier + ", x" + s.multiplier + ", abilities: " + (s.abilities.join(", ") || "none")));
  return L.join("\n") + "\n";
}

main().catch(e => { console.error("Audit failed:", e.message); process.exit(1); });
