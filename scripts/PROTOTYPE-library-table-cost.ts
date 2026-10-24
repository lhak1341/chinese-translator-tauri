// Measure: union size of frequent (count>=3) 2-8-grams across N library books, and time per book.
import fs from 'node:fs';
import os from 'node:os';
const home = os.homedir();
const app = `${home}/Library/Application Support/com.lhak.chinese-translator`;
const recs = Object.values(JSON.parse(fs.readFileSync(`${app}/books.json`, 'utf8'))) as any[];
const books = recs
  .filter((v) => v.available && /^(GBK|UTF-8)$/.test(v.encodingLabel))
  .sort((a, b) => (a.title < b.title ? -1 : 1));
const step = Math.floor(books.length / 8);
const sample = books.filter((_, i) => i % step === 0).slice(0, 8);
const df = new Map<string, number>();
let tot = 0;
for (const b of sample) {
  const t0 = Date.now();
  const text = new TextDecoder(b.encodingLabel === 'UTF-8' ? 'utf-8' : 'gb18030').decode(
    fs.readFileSync(`${home}/Downloads/_FICTION/${b.lastKnownPath}`)
  );
  const runs = text.match(/[㐀-鿿]+/g) ?? [];
  let prev = new Map<string, number>();
  let hanzi = 0;
  for (const r of runs) hanzi += r.length;
  let perBook = 0;
  for (let n = 1; n <= 8; n++) {
    const m = new Map<string, number>();
    for (const r of runs)
      for (let i = 0; i + n <= r.length; i++) {
        const g = r.slice(i, i + n);
        if (n > 1 && !prev.has(g.slice(0, n - 1))) continue;
        m.set(g, (m.get(g) ?? 0) + 1);
      }
    for (const [g, c] of m) if (c < 3) m.delete(g);
    if (n >= 2)
      for (const g of m.keys()) {
        df.set(g, (df.get(g) ?? 0) + 1);
        perBook++;
      }
    prev = m;
  }
  tot += hanzi;
  console.log(
    `${b.title.slice(-6).padEnd(8)} ${String(hanzi).padStart(9)} hanzi  ${String(perBook).padStart(8)} frequent grams  ${Date.now() - t0} ms  union ${df.size}`
  );
}
console.log(
  `union after ${sample.length} books: ${df.size} grams from ${tot} hanzi; ~${((df.size * 5) / 1e6).toFixed(0)} MB at 5 B/entry (4 B hash + 1 B df)`
);
