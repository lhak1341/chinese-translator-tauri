// PROTOTYPE, THROWAWAY (wayfinder ticket "Scoring prototype run on the held-out books").
// Question: which mix of signals recovers a book's hidden proper nouns in the top N?
// Run: bun scripts/PROTOTYPE-candidate-finder.ts <truth.json> [--show 40]
// Reads the library and app data read-only. Writes nothing. No tests, no polish.
import fs from 'node:fs';
import os from 'node:os';

const truthPath = process.argv[2];
const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 0;
const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'));
const home = os.homedir();
const app = `${home}/Library/Application Support/com.lhak.chinese-translator`;
const text = new TextDecoder('gb18030').decode(
  fs.readFileSync(`${home}/Downloads/_FICTION/${truth.file}`)
);
const MIN = 3; // frequency floor
const MAXLEN = 8;

// Hanzi runs; anything else (punctuation, newline, latin, dot) is a boundary.
const runs = text.match(/[㐀-鿿]+/g) ?? [];
const total = runs.reduce((s, r) => s + r.length, 0);

// ---- counts by Apriori growth: an n-gram is counted only if its (n-1)-prefix is frequent ----
const t0 = Date.now();
const counts: Map<string, number>[] = [new Map()];
for (let n = 1; n <= MAXLEN + 1; n++) {
  const m = new Map<string, number>();
  const prev = counts[n - 1];
  for (const r of runs) {
    for (let i = 0; i + n <= r.length; i++) {
      const g = r.slice(i, i + n);
      if (n > 1 && !prev.has(g.slice(0, n - 1))) continue;
      m.set(g, (m.get(g) ?? 0) + 1);
    }
  }
  for (const [g, c] of m) if (c < MIN) m.delete(g);
  counts.push(m);
}
const cnt = (g: string) => counts[g.length]?.get(g) ?? 0;

// ---- neighbour sets (accessor variety) and the largest single-neighbour count ----
const left = new Map<string, Set<string>>();
const right = new Map<string, Set<string>>();
for (let n = 2; n <= MAXLEN; n++) {
  const lv = counts[n];
  for (const r of runs) {
    for (let i = 0; i + n <= r.length; i++) {
      const g = r.slice(i, i + n);
      if (!lv.has(g)) continue;
      const l = i === 0 ? '^' : r[i - 1];
      const rr = i + n === r.length ? '$' : r[i + n];
      (left.get(g) ?? left.set(g, new Set()).get(g)!).add(l);
      (right.get(g) ?? right.set(g, new Set()).get(g)!).add(rr);
    }
  }
}
const maxL = new Map<string, number>();
const maxR = new Map<string, number>();
for (let n = 3; n <= MAXLEN + 1; n++) {
  for (const [g, c] of counts[n]) {
    const suf = g.slice(1);
    const pre = g.slice(0, -1);
    if ((maxL.get(suf) ?? 0) < c) maxL.set(suf, c);
    if ((maxR.get(pre) ?? 0) < c) maxR.set(pre, c);
  }
}

// ---- features ----
const rules: string[] = JSON.parse(fs.readFileSync(`${app}/transform-rules.json`, 'utf8'))
  .filter((r: { enabled: boolean }) => r.enabled)
  .map((r: { key: string }) => r.key);
const phrases = new Set(
  Object.keys(JSON.parse(fs.readFileSync(`${app}/dictionaries/phrases.json`, 'utf8')))
);
const ADHESIVE = new Set([
  ...'的了是在和就都也不他她它我你您说道着过地得之而与或但被把让给又还很更最这那有没吗呢吧啊哦嗯么什向',
]);
const START_ADHESIVE = new Set(['一']); // 一个/一丝/一声/一片 // hand list, tunable
const npmiWeakest = (g: string) => {
  const pw = cnt(g) / total;
  let worst = Infinity;
  for (let k = 1; k < g.length; k++) {
    const a = cnt(g.slice(0, k)) / total;
    const b = cnt(g.slice(k)) / total;
    if (!a || !b) continue;
    const v = Math.log(pw / (a * b)) / -Math.log(pw);
    if (v < worst) worst = v;
  }
  return worst;
};
type Cand = {
  g: string;
  c: number;
  av: number;
  npmi: number;
  rule: boolean;
  adhesive: boolean;
  phrase: boolean;
  closed: boolean;
  closed70: boolean;
  other: number;
  df: number;
  glued: boolean;
};
const cands: Cand[] = [];
for (let n = 2; n <= MAXLEN; n++) {
  for (const [g, c] of counts[n]) {
    const av = Math.min(left.get(g)!.size, right.get(g)!.size);
    const closed = (maxL.get(g) ?? 0) / c < 0.9 && (maxR.get(g) ?? 0) / c < 0.9;
    const closed70 = (maxL.get(g) ?? 0) / c < 0.7 && (maxR.get(g) ?? 0) / c < 0.7;
    cands.push({
      g,
      c,
      av,
      npmi: npmiWeakest(g),
      closed,
      closed70,
      other: 0,
      df: 0,
      glued: false,
      rule: rules.some((k) => g.length > k.length && g.endsWith(k)),
      adhesive: ADHESIVE.has(g[0]) || ADHESIVE.has(g[g.length - 1]) || START_ADHESIVE.has(g[0]),
      phrase: phrases.has(g),
    });
  }
}
console.log(
  `${truth.dictionary}: ${total} hanzi, ${cands.length} frequent 2-${MAXLEN}-grams, built in ${Date.now() - t0} ms`
);

// ---- cross-book spread: count prefiltered candidates in a sample of OTHER library books ----
const pre = new Map<string, Cand>();
for (const c of cands) if (c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3) pre.set(c.g, c);
const firstChars = new Set([...pre.keys()].map((g) => g[0]));
const bookRecs = Object.values(JSON.parse(fs.readFileSync(`${app}/books.json`, 'utf8'))) as {
  title: string;
  lastKnownPath: string;
  available: boolean;
  encodingLabel: string;
  sizeBytes: number;
}[];
const others = bookRecs
  .filter(
    (v) =>
      v.lastKnownPath !== truth.file &&
      v.available &&
      /^(GBK|UTF-8)$/.test(v.encodingLabel) &&
      v.sizeBytes > 1.5e6 &&
      v.sizeBytes < 8e6
  )
  .sort((a, b) => (a.title < b.title ? -1 : 1));
const step = Math.max(1, Math.floor(others.length / 8));
const sample = others.filter((_, i) => i % step === 0).slice(0, 8);
let otherTotal = 0;
const t1 = Date.now();
for (const b of sample) {
  const t = new TextDecoder(b.encodingLabel === 'UTF-8' ? 'utf-8' : 'gb18030').decode(
    fs.readFileSync(`${home}/Downloads/_FICTION/${b.lastKnownPath}`)
  );
  const seen = new Set<Cand>();
  for (const r of t.match(/[\u3400-\u9fff]+/g) ?? []) {
    otherTotal += r.length;
    for (let i = 0; i < r.length; i++) {
      if (!firstChars.has(r[i])) continue;
      for (let n = 2; n <= MAXLEN && i + n <= r.length; n++) {
        const c = pre.get(r.slice(i, i + n));
        if (c) {
          c.other++;
          seen.add(c);
        }
      }
    }
  }
  for (const c of seen) c.df++;
}
console.log(
  `spread: ${sample.length} other books (${sample.map((b) => b.title.slice(-6)).join(' ')}), ${otherTotal} hanzi, ${Date.now() - t1} ms`
);

// ---- glued edge: w = 1-2 chars + a strong candidate (or the reverse) whose count is >=20x w's ----
const baseKeep = (c: Cand) =>
  c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase && c.df <= 2;
const base = new Map<string, Cand>();
for (const c of cands) if (baseKeep(c)) base.set(c.g, c);
for (const c of base.values()) {
  for (let k = 1; k <= 2; k++) {
    if (c.g.length - k < 2) continue;
    const tail = base.get(c.g.slice(k));
    const head = base.get(c.g.slice(0, -k));
    if ((tail && tail.c >= 20 * c.c) || (head && head.c >= 20 * c.c)) c.glued = true;
  }
}
const ratio = (c: Cand) => c.c / total / ((c.other + 0.5) / otherTotal);

// ---- evaluation ----
const findable = new Map<string, number>(); // hidden entry -> length
for (const e of truth.entries)
  if (e.len >= 2 && e.len <= MAXLEN && e.count >= MIN) findable.set(e.source, e.len);
const typeOf = new Map<string, string | null>(
  truth.entries.map((e: { source: string; semanticType: string | null }) => [
    e.source,
    e.semanticType,
  ])
);
console.log(
  `findable hidden entries (len 2-${MAXLEN}, count>=${MIN}): ${findable.size}, long (5-8): ${[...findable.values()].filter((l) => l >= 5).length}`
);

type Variant = { name: string; keep: (c: Cand) => boolean; score: (c: Cand) => number };
const byCount = (c: Cand) => c.c;
const variants: Variant[] = [
  { name: 'V0 raw count, no gate', keep: () => true, score: byCount },
  ...[3, 5, 8].map((a) => ({
    name: `V1 closed + AV>=${a}`,
    keep: (c: Cand) => c.closed && c.av >= a,
    score: byCount,
  })),
  ...[3, 5, 8].map((a) => ({
    name: `V2 V1(${a}) + no adhesive edge`,
    keep: (c: Cand) => c.closed && c.av >= a && !c.adhesive,
    score: byCount,
  })),
  ...[0.3, 0.5].map((t) => ({
    name: `V3 V2(5) + npmi>=${t}`,
    keep: (c: Cand) => c.closed && c.av >= 5 && !c.adhesive && c.npmi >= t,
    score: byCount,
  })),
  {
    name: 'V4 V3(.3) + rule boost x3',
    keep: (c) => c.closed && c.av >= 5 && !c.adhesive && c.npmi >= 0.3,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
  {
    name: 'V5 V4 + drop phrases hit',
    keep: (c) => c.closed && c.av >= 5 && !c.adhesive && c.npmi >= 0.3 && !c.phrase,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
  {
    name: 'V6 V5 but AV>=3 (+edge fixes)',
    keep: (c) => c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
  ...[4, 2, 1].map((k) => ({
    name: `V7 V6 + seen in <=${k} of ${sample.length} books`,
    keep: (c: Cand) =>
      c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase && c.df <= k,
    score: (c: Cand) => c.c * (c.rule ? 3 : 1),
  })),
  ...[10, 50].map((r) => ({
    name: `V8 V6 + book-rate ratio >=${r}`,
    keep: (c: Cand) =>
      c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase && ratio(c) >= r,
    score: (c: Cand) => c.c * (c.rule ? 3 : 1),
  })),
  {
    name: 'V9 V8(10) ranked by ratio*count',
    keep: (c) =>
      c.closed && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase && ratio(c) >= 10,
    score: (c) => c.c * Math.min(ratio(c), 100) * (c.rule ? 3 : 1),
  },
  {
    name: 'V10 V8(10) + dominance 0.7',
    keep: (c) =>
      c.closed70 && c.av >= 3 && !c.adhesive && c.npmi >= 0.3 && !c.phrase && ratio(c) >= 10,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
  {
    name: 'V11 V7(<=2) + glued-edge drop',
    keep: (c) => baseKeep(c) && !c.glued,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
  {
    name: 'V12 V11 + dominance 0.7',
    keep: (c) => baseKeep(c) && !c.glued && c.closed70,
    score: (c) => c.c * (c.rule ? 3 : 1),
  },
];
const pad = (s: string | number, w: number) => String(s).padEnd(w);
console.log(
  pad('variant', 34) +
    pad('pool', 8) +
    pad('ceiling%', 10) +
    'recall@300/1000 (long@1000)   precision@100/300/1000'
);
let lastRanked: Cand[] = [];
for (const v of variants) {
  const pool = cands.filter(v.keep).sort((a, b) => v.score(b) - v.score(a));
  const hit = (c: Cand) => findable.has(c.g);
  const ceiling = pool.filter(hit).length;
  const at = (n: number) => pool.slice(0, n).filter(hit).length;
  const longAt = pool.slice(0, 1000).filter((c) => hit(c) && c.g.length >= 5).length;
  const longAll = [...findable.values()].filter((l) => l >= 5).length;
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) : '-');
  console.log(
    pad(v.name, 34) +
      pad(pool.length, 8) +
      pad(pct(ceiling, findable.size), 10) +
      `${pct(at(300), findable.size)}% / ${pct(at(1000), findable.size)}% (${pct(longAt, longAll)}%)`.padEnd(
        30
      ) +
      `${pct(at(100), Math.min(100, pool.length))}% / ${pct(at(300), Math.min(300, pool.length))}% / ${pct(at(1000), Math.min(1000, pool.length))}%`
  );
  if (v.name.startsWith(process.env.SHOWV ?? 'V12 V11 + dominance')) lastRanked = pool;
}
if (show) {
  console.log(
    `\nTop ${show} of the variant named by SHOWV (default V12). Marker: + hidden entry, . not in dictionary (new name, or noise)`
  );
  lastRanked
    .slice(0, show)
    .forEach((c, i) =>
      console.log(
        `${String(i + 1).padStart(3)} ${findable.has(c.g) ? '+' : '.'} ${c.g}\tcount ${c.c}\tAV ${c.av}\tnpmi ${c.npmi.toFixed(2)}\tdf ${c.df}\tratio ${ratio(c).toFixed(0)}${c.rule ? '\trule' : ''}${typeOf.get(c.g) ? '\t' + typeOf.get(c.g) : ''}`
      )
    );
}
