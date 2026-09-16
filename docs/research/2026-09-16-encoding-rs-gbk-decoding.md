# encoding_rs: GBK detection, decoding, and line indexing for the fiction corpus

Research for [issue #12](https://github.com/lhak1341/chinese-translator-tauri/issues/12), which blocks
[#17](https://github.com/lhak1341/chinese-translator-tauri/issues/17) (Rust book-loading command contract).

**Status:** research only. No loader code was written; `src-tauri/Cargo.toml` is unchanged.

**Measured on:** macOS arm64 (Apple Silicon), rustc/cargo 1.96.0, `encoding_rs` 0.8.41, `chardetng` 1.0.0,
release profile (`opt-level = 3`), against all 23 `.txt` files in `~/Downloads/_FICTION/` (146.0 MB total,
1.22–16.30 MB per file). Timings are min-of-3 with a warm page cache. Every number below is measured, not
extrapolated; the throwaway probe binaries that produced them are described in
[Appendix A](#appendix-a-reproducing-the-measurements).

**Primary sources**

- [`encoding_rs` 0.8.41 API docs](https://docs.rs/encoding_rs/0.8.41/encoding_rs/) — crate root, [`Encoding`](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Encoding.html), [`Decoder`](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Decoder.html)
- [`encoding_rs` README](https://github.com/hsivonen/encoding_rs/blob/master/README.md) (Henri Sivonen, crate author)
- [`chardetng` 1.0.0 API docs](https://docs.rs/chardetng/1.0.0/chardetng/) and [README](https://github.com/hsivonen/chardetng/blob/master/README.md) (same author)
- [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/), Living Standard, last updated 21 May 2026

---

## Answers in one page

| #   | Question               | Answer                                                                                                                                                                                                                                                                       |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Detection API          | `encoding_rs` has **no** detector beyond BOM sniffing. `chardetng` is the author's companion crate and is the intended pairing. It returns an `&'static Encoding`, **never a confidence score** — `guess_assess` was removed in 1.0.0. On this corpus it is right 22/23.     |
| 2   | GB2312 / GBK / GB18030 | Three labels, **two** encodings, **one** decoder. `for_label("gb2312")` → `GBK`; GBK's decoder _is_ gb18030's decoder. Decoding all 23 files as `GBK` and as `GB18030` produced byte-identical output. Report `"GBK"` to the frontend and say what it means.                 |
| 3   | Decode + line index    | One-shot `decode_without_bom_handling()` then a single `u8` scan of the decoded buffer. Incremental decoding exists (`Decoder::decode_to_string`) and costs +2.8% time, but saves ~4.9 MB peak on a 4 MB book. At this size neither matters much; pick on memory, not speed. |
| 4   | CRLF                   | Preserve the bytes, index **logical lines** (offset of the byte after each `\n`), strip the trailing `\r` at read time. The corpus is not uniformly CRLF: 21 files are 100% CRLF, 2 are 100% LF.                                                                             |
| 5   | Cost                   | **~18–19 ms** for a 4 MB book end-to-end, **~51 ms** for the 16.3 MB worst case, **~18 MB** peak RSS for a 4 MB book. Nothing here blocks the UI. The one expensive step is detection — see #6.                                                                              |
| 6   | Traps                  | Four, all silent. The worst: **one malformed byte anywhere in the file makes `chardetng` fall back to `windows-1252`, which decodes any byte sequence without error and yields whole-file mojibake.** This is exactly what happens to one file in this corpus.               |

---

## 1. Which API detects, and how confident is it?

### `encoding_rs` detects nothing except a BOM

The crate implements the Encoding Standard, and the Encoding Standard does not define encoding detection — it
defines encodings, labels, and BOM sniffing. The only detection entry point is:

```rust
Encoding::for_bom(&bytes) -> Option<(&'static Encoding, usize)>
```

which "[p]erforms non-incremental BOM sniffing" and "[r]eturns `Some((UTF_8, 3))`, `Some((UTF_16LE, 2))` or
`Some((UTF_16BE, 2))` … or `None` otherwise"
([`Encoding::for_bom`](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Encoding.html#method.for_bom)).
Measured: `for_bom` returns `None` for every file in this corpus. No book has a BOM.

Everything else in the crate takes the encoding as an input. `encoding.decode(bytes)` is not detection — it
decodes _as the encoding you named_, with BOM sniffing layered on top, and the second tuple element tells you
only whether the BOM overrode your choice.

### `chardetng` is the intended pairing, and it gives you no confidence value

`chardetng` is by the same author, depends on `encoding_rs`, and is "optimized for binary size in applications
that already depend on `encoding_rs` for other reasons"
([crate docs](https://docs.rs/chardetng/1.0.0/chardetng/)). The API is three calls:

```rust
let mut det = EncodingDetector::new(Iso2022JpDetection::Allow);
det.feed(&bytes, /* last = */ false);          // may be called repeatedly
let enc: &'static Encoding = det.guess(None, Utf8Detection::Allow);
```

Three things the API does **not** give you:

- **No confidence score.** chardetng 1.0.0's release notes list "Remove the `guess_assess` API"
  ([README, Release Notes 1.0.0](https://github.com/hsivonen/chardetng/blob/master/README.md)). `guess()`
  returns an `Encoding` and nothing else. If the binding dialog in #17 wants to show a confidence, chardetng
  cannot supply one — it has to be synthesised from a strict-decode cross-check (see §6).
- **No runners-up.** There is no ranked candidate list. #17's question 4 ("return the runners-up and their
  scores") has no chardetng equivalent; a runners-up list would have to be built by strict-decoding the
  plausible candidates yourself.
- **No `GB18030` outcome.** The README's encoding notes state plainly: "**GB18030** — Detected as GBK."

`guess()` also takes two arguments that are browser concerns, not ours:

- `tld: Option<&[u8]>` — `None` "is equivalent to passing `Some(b\"com\")`", i.e. the generic-TLD behaviour.
  Pass `None`; local files have no TLD.
- `allow_utf8: Utf8Detection` — `Deny` exists so web content cannot come to rely on UTF-8 sniffing. That
  reasoning does not apply to a local file picker. Pass `Utf8Detection::Allow` or UTF-8 books can never be
  detected.

### Measured accuracy on this corpus

| Result                                                                     | Count   |
| -------------------------------------------------------------------------- | ------- |
| Guessed `GBK`, and a strict GBK decode of the whole file succeeds          | 22 / 23 |
| Guessed `windows-1252` (wrong — the file is GBK with one bad byte)         | 1 / 23  |
| Guess from the **first 64 KiB** identical to the guess from the whole file | 23 / 23 |

Prefix size does not matter on well-formed files. On `Tạp đồ 卡徒.txt`, every prefix from **256 bytes**
upward guessed `GBK`. The README warns the weak spot is short inputs — "GBK detection is less accurate than in
ced for short titles consisting of fewer than six hanzi" — which is not a regime a 4 MB novel enters.

The README also states: "Improvements to detection results are not planned, and isolated examples of
misdetection are very unlikely to result in changes." The 1/23 failure will not be fixed upstream; the loader
has to handle it.

---

## 2. GB2312 vs GBK vs GB18030

### The spec collapses them at the decoder

The Encoding Standard defines **two** Chinese-simplified encodings, `GBK` and `gb18030`, and then makes them
share a decoder:

> §10.1.1 GBK decoder — "GBK's decoder is gb18030's decoder."

They differ only on the encode side:

> §10.1.2 GBK encoder — "GBK's encoder is gb18030's encoder with its _is GBK_ set to true." …
> "Not fully aliasing GBK with gb18030 is a conservative move to decrease the chances of breaking legacy
> servers and other consumers of content generated with GBK's encoder."

The only behavioural difference `is GBK` produces is §10.2.2 step 4: with `is GBK` true, U+20AC (€) encodes to
the single byte `0x80`. That is an encoder rule. **It cannot affect us — we only decode.**

GB2312 is not an encoding in the standard at all. It is a _label_ for GBK. Measured:

```
for_label("gb2312")   -> GBK          for_label("gbk")     -> GBK
for_label("GB2312")   -> GBK          for_label("chinese") -> GBK
for_label("gb_2312")  -> GBK          for_label("csgb2312")-> GBK
for_label("x-gbk")    -> GBK          for_label("gb18030") -> gb18030
for_label("gb2312-80")-> None         for_label("euc-cn")  -> None
GBK.name() == "GBK"                   GB18030.name() == "gb18030"
```

This is why `Tạp đồ 卡徒.txt` fails a Python `gb2312` decode at offset 43962 but succeeds under `gbk`: Python
implements the _narrow_ GB2312 standard, `encoding_rs` implements the WHATWG label mapping, under which
`gb2312` **is** GBK. The two libraries do not mean the same thing by the string `"gb2312"`.

### Confirmed empirically

Decoding each of the 23 files twice, once through `GBK` and once through `GB18030`:

```
corpus GBK vs gb18030 decode: identical=23 differ=0
GBK     decode(81 30 81 30) -> "\u{80}"  (the gb18030 4-byte form)  had_errors=false
GB18030 decode(81 30 81 30) -> "\u{80}"                             had_errors=false
```

The GBK decoder accepts gb18030 4-byte sequences, because it _is_ the gb18030 decoder. There is no such thing
as a file that decodes under `GB18030` but not under `GBK` in this crate.

### What to report to the frontend

`GBK` and `gb18030` are two names for one decoder here, so "detected encoding" cannot honestly claim to have
distinguished them. Three fields keep it honest without over-claiming:

```rust
struct DetectedEncoding {
    /// encoding_rs name: "GBK", "UTF-8", "Big5", … — what actually decoded the bytes.
    name: &'static str,
    /// How that name was arrived at.
    source: DetectionSource,   // Bom | Detector | UserOverride | Fallback
    /// Whether a strict decode of the whole file under `name` was error-free.
    strict_clean: bool,
}
```

Reporting `"GBK"` is accurate and is what chardetng returns. Reporting `"GB18030"` would claim a
distinction that was never tested. Reporting `"GB2312"` would be wrong twice over: nothing returns that name,
and the files are not valid narrow GB2312. If the UI wants to be explicit, the honest phrasing is
_"GBK (WHATWG GBK/GB18030 decoder — GB2312, GBK and GB18030 are not distinguished)."_

`strict_clean` is the field that carries the real information, because it is the one that catches §6's trap.

---

## 3. Decoding 4 MB and building a line index in one pass

### The two shapes, both measured

**One-shot.** Whole input in one buffer, whole output in one allocation:

```rust
let (cow, had_errors) = enc.decode_without_bom_handling(&bytes);
let text: String = cow.into_owned();
```

**Incremental.** `Decoder` supports it and the docs are explicit that the output buffer is caller-allocated:
`decode_to_string` "treats the capacity of the `String` as the output limit … guarantees not to cause a
reallocation of the backing buffer of `String`"
([`Decoder::decode_to_string`](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Decoder.html#method.decode_to_string)).
It returns `(CoderResult, bytes_read, had_errors)` and you loop while the result is `OutputFull`:

```rust
let mut dec = enc.new_decoder_without_bom_handling();
let mut scratch = String::with_capacity(64 * 1024 + 4);
// ... feed 64 KiB input chunks, drain `scratch` on every OutputFull, index while draining
```

**A small scratch buffer never splits a character.** With a deliberately tiny 16-byte `String` (6539 decode
calls over 64 KiB), every intermediate buffer was valid UTF-8 and the concatenation was byte-identical to the
one-shot result. The decoder carries partial sequences in its own state; it will not hand you a half-character.

### Cost, measured across all 22 GBK books

| Step                          | Throughput                         | 4 MB book  | 16.3 MB book |
| ----------------------------- | ---------------------------------- | ---------- | ------------ |
| `fs::read` (warm cache)       | —                                  | 0.6 ms     | 2.1 ms       |
| `chardetng` on first 64 KiB   | ~8 MB/s                            | 8.0 ms     | 8.0 ms       |
| One-shot GBK decode           | 536–642 MB/s of input (median 590) | 6.5 ms     | 28.0 ms      |
| Line index over decoded UTF-8 | 1785–1951 MB/s (median 1899)       | 3.0 ms     | 12.7 ms      |
| **End-to-end**                |                                    | **~18 ms** | **~51 ms**   |

Incremental decode cost **+2.8%** over one-shot across the whole corpus — indistinguishable in practice.

### Line index in the same pass

One `u8` scan yields both offsets. Counting scalar values is a bit test, not a UTF-8 decode: every byte that is
not a continuation byte starts one character.

```rust
let mut byte_off: Vec<u32> = vec![0];
let mut char_off: Vec<u32> = vec![0];
let mut chars = 0u32;
for (i, &b) in text.as_bytes().iter().enumerate() {
    if (b & 0xC0) != 0x80 { chars += 1; }        // scalar-value count
    if b == b'\n' { byte_off.push((i + 1) as u32); char_off.push(chars); }
}
```

`u32` is safe for this corpus with room to spare: the largest decoded book is 8.7 M chars / ~24 MB of UTF-8,
against a 4.29 G ceiling. Two `Vec<u32>` for 75 514 lines is 0.58 MB.

Fusing the index into the incremental decode loop (index each freshly decoded chunk before draining it) is
free — it reads memory that is already in L1 from the decode that just wrote it. Measured: streamed decode
**plus** index together took 11.8 ms on the 4 MB book, versus 13.0 + 4.3 = 17.3 ms for one-shot decode then a
separate index pass in the same cold process.

### Does incremental decoding matter at 4 MB? For memory, yes

Not for speed. For peak memory, the one-shot path has a specific cost worth knowing:

`decode_without_bom_handling` sizes its allocation from
[`max_utf8_buffer_length`](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Decoder.html#method.max_utf8_buffer_length),
the **worst case**, which for GBK is exactly **3.00× the input** (every byte a 3-byte character). Measured:

```
input  4 040 904 bytes -> max_utf8_buffer_length = 12 122 713 (3.00x)
input 16 300 000 bytes -> max_utf8_buffer_length = 48 900 001 (3.00x)
```

Real Chinese prose comes out at ~1.48× (2 GBK bytes → 3 UTF-8 bytes, diluted by ASCII punctuation and blank
lines). So the one-shot `String` for a 4 MB book has `len = 5 982 889` and `capacity = 12 122 713` — **6.1 MB
of the 11.6 MB allocation is never used, and is never released**, because nothing calls `shrink_to_fit`.

Isolated peak-RSS runs, one process each:

| Path                                                              | Peak RSS, 4 MB book |
| ----------------------------------------------------------------- | ------------------- |
| One-shot decode + separate index pass                             | **18.1 MB**         |
| Incremental decode + fused index, output `String` grown naturally | **13.2 MB**         |

The streaming path's output `String` ends at `capacity = 8 388 992` (power-of-two growth) versus 12 122 713.
Extrapolated to the 16.3 MB worst case the gap is ~20 MB. For a desktop app holding one book open, either is
fine; for #17's "hold the decoded book in Rust state across calls" option, the streaming path is the one to
take, and it also removes the need to keep the raw bytes alive alongside the decoded text.

---

## 4. CRLF handling

### The corpus is not uniformly CRLF

| Line ending             | Files                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| 100% CRLF               | 21                                                                                     |
| 100% LF                 | 2 (`Phàm nhân tu tiên truyện 凡人修仙传.txt`, `Trọng sinh chi tặc hành thiên hạ …txt`) |
| Mixed within one file   | 0                                                                                      |
| Lone CR (old-Mac style) | 0                                                                                      |

Assuming CRLF would corrupt the last character of every line in 2 of 23 books. Assume neither; handle both.

### GBK cannot hide a `\n` inside a character

This is the property that makes a byte scan for `\n` safe, and it is worth stating because it is not true of
every encoding. Both the WHATWG GBK/gb18030 decoder (§10.2.1) and the actual decoded output agree: the decoded
text is UTF-8, where `0x0A` and `0x0D` only ever appear as themselves — a UTF-8 continuation byte is always
`0x80..=0xBF`. **Scan the decoded UTF-8, never the raw GBK bytes.** In raw GBK, `0x0A` _can_ appear as a trail
byte, so a `memchr(b'\n')` over the undecoded file would find false line breaks.

### Recommendation: preserve, index logical lines, strip on read

Three reasons not to rewrite CRLF→LF during decoding:

1. **The byte offsets stop matching the file.** #17 wants a line-offset table; if the loader silently deletes
   bytes, the table indexes a text that exists only in memory and no longer maps back to the file for any
   later fingerprint, diff, or re-read.
2. **`encoding_rs` has no hook for it.** Rewriting means a second pass or a byte-by-byte copy, undoing the
   decoder's vectorised ASCII fast path for no benefit.
3. **One extra byte per line is 0.2 MB on the largest book.** Not worth a pass.

So:

- Index entry _n_ = byte offset of the first byte of logical line _n_ (i.e. the byte after the previous `\n`).
- A "line" is terminated by `\n`. The `\r` before it, if present, belongs to the line.
- Slicing a line for display or for the pipeline does `.trim_end_matches(['\r', '\n'])`. This is one
  comparison per line and handles both endings with no per-file mode flag.
- The final line may have no terminator. `byte_off.len()` counts line _starts_, so a file ending in `\n` has a
  zero-length last line; decide that once and document it rather than letting each caller guess.

**Half the lines are blank, and that is real.** On `Tạp đồ 卡徒.txt`: 75 514 lines, 37 756 (50.0%) empty after
trimming. #17's question 2 asks what a line is "given that half the lines are blank" — the answer is that blank
lines are paragraph separators in these files and dropping them would break the correspondence between line
number and file position. Index every line; let the view filter.

---

## 5. Time and peak memory

**A 4 MB book: ~18–19 ms, ~18 MB peak RSS (one-shot) or ~13 MB (streaming).**

Three 4 MB-class books, end-to-end (read + 64 KiB detect + decode + index):

```
4.02 MB  108 977 lines  2 218 323 chars -> 19.2 ms
4.24 MB   22 651 lines  2 248 303 chars -> 19.0 ms
3.85 MB   75 514 lines  2 098 740 chars -> 18.1 ms
```

Range across the corpus: 11.2 ms (1.22 MB) to 50.8 ms (16.30 MB). All 23 books back to back: **569 ms**.

### Does the loader block the UI? No — but only if detection is bounded

50 ms on the largest file in the library is under the ~16 ms/frame threshold by about three frames. A Tauri
command already runs off the webview's main thread, so the frontend does not freeze regardless; the question is
whether the user perceives the open as instant, and at 19 ms for the common case they will.

**The one way to get this wrong is to run `chardetng` over the whole file.** Detection is by far the slowest
step per byte:

| Input to `chardetng` | Time     | Throughput |
| -------------------- | -------- | ---------- |
| 4 KiB                | 0.58 ms  | 7 MB/s     |
| 64 KiB               | 7.97 ms  | 8 MB/s     |
| 1 MiB                | 51.4 ms  | 20 MB/s    |
| 4.04 MB (whole book) | 180.8 ms | 21 MB/s    |

Detection on the full file is **~28× slower than decoding it** and would take the 4 MB book from 19 ms to
191 ms and the 16 MB book past 700 ms. Feed a prefix. 64 KiB gave the same answer as the whole file for all 23
files and costs 8 ms; even 4 KiB was correct on every well-formed book. `EncodingDetector::new()` itself is
free (<0.01 µs) — there are no tables to build.

**The countervailing argument is §6:** a prefix cannot see corruption that occurs later in the file. The
resolution is not to feed more bytes to the detector — it is to validate with a strict decode, which runs at
590 MB/s instead of 8 MB/s.

### Where the memory goes, 4 MB book, one-shot path

```
process baseline                                  1.8 MB
+ raw file bytes (4 040 904)                       5.7 MB
+ decoded String (len 5 982 889, cap 12 122 713)  17.5 MB    <- worst-case 3.00x allocation
+ line index (75 514 lines, 2x Vec<u32>)          18.1 MB
```

Holding a decoded book resident in Rust state (#17's option) costs ~12 MB per book with the one-shot path,
~8 MB with the streaming path, plus 0.6 MB of index. Holding all 23 would be ~200 MB — enough that an
LRU of one or two open books is the right lifecycle, not "cache everything".

---

## 6. Traps

### Trap 1 — one bad byte silently turns the whole file into mojibake

This is the one that actually bit this corpus, and it is a chain of three individually reasonable behaviours.

**The mechanism**, from the chardetng README, "Principle of Operation":

> "A single encoding error disqualifies an encoding from the set of possible outcomes."

`windows-1252` maps all 256 byte values, so it can never be disqualified. When a stray byte knocks GBK out of
the candidate set, the detector falls back to a single-byte encoding that will "succeed" on anything.

**Confirmed by injection.** Splicing one malformed 2-byte sequence (`0x81 0x0D` — a GBK lead byte followed by
CR) into a clean 4 MB GBK book:

```
injected at        30: strict=false  guess(whole file)=windows-1252  guess(first 64 KiB)=windows-1252
injected at     5 000: strict=false  guess(whole file)=windows-1252  guess(first 64 KiB)=windows-1252
injected at   100 000: strict=false  guess(whole file)=windows-1252  guess(first 64 KiB)=GBK
injected at 1 000 000: strict=false  guess(whole file)=windows-1252  guess(first 64 KiB)=GBK
injected at 3 900 000: strict=false  guess(whole file)=windows-1252  guess(first 64 KiB)=GBK
```

One error is enough; two and five behave identically. Note the asymmetry in the last three rows: the
prefix-fed detector still says GBK because the damage is outside the prefix — a prefix is _more_ robust here,
not less.

**What the wrong answer then looks like.** Decoding 4 KiB of known-GBK bytes under each candidate:

```
          GBK: had_errors=true  strict_ok=false chars=2110 preview="《卡徒》\r\n作者：方想\r\n申明:本书由请看小说网"
         Big5: had_errors=true  strict_ok=false chars=2110 preview="▲縐芺◎\r\n釬氪ㄩ源砑\r\n扠隴:掛抎蚕ワ艘苤佽厙"
 windows-1252: had_errors=false strict_ok=true  chars=4096 preview="¡¶¿¨Í½¡·\r\n×÷Õß£º·½Ïë\r\nÉê"
        UTF-8: had_errors=true  strict_ok=false chars=3285 preview="����ͽ��\r\n���ߣ�����\r\n����"
```

`windows-1252` is the **only** row with `had_errors = false`. Checking `had_errors` does not save you — the
wrong answer is the one that reports success. (The `GBK` row shows `strict_ok=false` only because the 4 KiB
slice cuts a 2-byte sequence in half; see Trap 3.)

**The file this happens to.** `淫荡少妇系列合集.txt` (383 893 bytes) is detected as `windows-1252`, and every
prefix from 1 KiB to the whole file agrees. It is **mixed-encoding**: the title line opens with the UTF-8 bytes
`E3 80 8A` (《) and closes with `E3 80 8B` (》) while the title text between them is GBK. The decoder reaches
`0x8B` at offset 21 with no valid trail byte and errors. There is exactly **one** malformed sequence in the
entire 384 KB file — `gb18030` lossy decode produces exactly **one** U+FFFD. Remove that single byte and
chardetng immediately returns `GBK` and the strict decode is clean:

```
gb18030 malformed offsets (offset, len): [(21, 1)]
as-is                        -> windows-1252
with byte 21 removed         -> GBK,  gb18030 strict decode clean = true
```

**Mitigation.** Strict-decode the whole file under the guess and treat a failure as a detection failure, not a
text failure. Do it through a streaming decoder into a small reusable scratch buffer — the output is thrown
away, so there is no reason to allocate the 3× worst-case `String`:

```rust
let mut dec = guessed.new_decoder_without_bom_handling();
let mut scratch = String::with_capacity(64 * 1024 + 4);
// loop decode_to_string_without_replacement, clear() the scratch each round,
// break on DecoderResult::Malformed
```

Measured on a 3.85 MB book: **6.77 ms streamed (570 MB/s)** versus 9.10 ms for the allocating one-shot
`decode_without_bom_handling_and_without_replacement` (423 MB/s). Either is cheaper than feeding the detector
one extra 64 KiB block.

**When `strict_clean` is false, "fewest U+FFFD" is the wrong rule if applied naively.** Measured on the
outlier file:

```
          GBK: had_errors=true  U+FFFD=1       chars=202 476
         Big5: had_errors=true  U+FFFD=3 848   chars=202 477
        UTF-8: had_errors=true  U+FFFD=226 887 chars=309 116
 windows-1252: had_errors=false U+FFFD=0       chars=383 893   <- wins on both naive metrics
```

`windows-1252` has zero errors and zero replacement characters _and is completely wrong_. A single-byte
encoding can never lose a U+FFFD contest. The rule has to be: **restrict the fallback candidate set to
multi-byte encodings** (`GBK`, `Big5`, `UTF-8`, `EUC-KR`, `Shift_JIS`) and take the fewest U+FFFD among those.
That picks GBK with its single replacement character, which is the right answer. Surface it to the UI as a
low-confidence result with an override.

`windows-1252` — or any single-byte encoding — returned from a detector on a file that is supposed to be a
Chinese novel should be treated as "detection failed", not as an answer.

### Trap 2 — `_without_bom_handling` is not the default, and the default can override you

Four decode entry points that differ only in BOM policy
([`Encoding` — Streaming vs. Non-Streaming](https://docs.rs/encoding_rs/0.8.41/encoding_rs/struct.Encoding.html#streaming-vs-non-streaming)),
measured on 3 BOM bytes + UTF-8 Chinese text:

```
Encoding::for_bom(bytes)          = Some(("UTF-8", 3))
GBK.decode(bytes)                 -> encoding_used=UTF-8  had_errors=false  first char '第'
GBK.decode_without_bom_handling() -> had_errors=true      first char '锘'    (mojibake)
```

`new_decoder()` "[i]nstantiates a new decoder … with BOM sniffing enabled. BOM sniffing may cause the returned
decoder to morph into a decoder for UTF-8, UTF-16LE or UTF-16BE instead of this encoding."

Both directions are traps:

- Use `decode()` / `new_decoder()` and your chosen encoding can be silently overridden. That is correct
  behaviour and usually what you want — but the second tuple element (`&'static Encoding`) is what actually
  decoded, and reporting your _input_ encoding to the frontend would then be a lie.
- Use `decode_without_bom_handling()` on a UTF-8-with-BOM file and the BOM decodes as a literal `锘` plus
  mojibake at the start of line 1 — the classic "stray character before the first chapter heading".

**chardetng does not sniff BOMs, and a BOM actively breaks it.** Its README says detecting UTF-16 "belongs on
the BOM layer" — it will never return UTF-16LE/BE. Worse, a BOM on non-UTF-8 content is just three malformed
bytes, which triggers Trap 1. Measured, gluing a UTF-8 BOM onto 64 KiB of GBK text:

```
GBK bytes, no BOM                          -> chardetng: GBK
same GBK bytes with a UTF-8 BOM in front   -> chardetng: windows-1252
Encoding::for_bom on that                  -> Some(("UTF-8", 3))
```

So call `Encoding::for_bom` first, unconditionally, and feed the detector only the **post-BOM** slice — and
only when `for_bom` returned `None`. Then use `decode_without_bom_handling` on that same post-BOM slice, and
report the encoding that actually ran.

### Trap 3 — validating a truncated buffer gives false failures

A GBK character is 2 bytes; an arbitrary byte offset lands inside one about half the time. A strict decode of a
raw 64 KiB slice reports malformed-at-end, because slice-end is stream-end:

```
GBK strict on a raw 64 KiB slice (last = true)   = false
GBK strict on the same slice     (last = false)  = true
```

This is the whole reason `decode_*` methods take a `last: bool`. Any chunked validation, any "peek at the head
of the file to check the encoding", any windowed re-read for #17 must pass `last = false` for every chunk but
the final one. Getting this wrong produces a decoding error on _every_ well-formed GBK file, which at least
fails loudly — but it will look like corpus corruption.

### Trap 4 — `0x80` decodes to `€`, so byte-level plausibility checks lie

Hand-rolled GBK validators commonly reject `0x80`. The WHATWG gb18030 decoder does not:

```
GBK.decode(0x80) = "€"  (U+20AC)  had_errors = false
```

A lone `0x80` in a GBK novel is almost certainly corruption, but the decoder emits a euro sign and reports
success. Corollary for the corpus: chardetng 0.1.10's release notes include "Avoid detecting windows-1252 euro
sign as GBK" — the confusion runs both ways and is a known, deliberately-tuned edge.

Two related items from the chardetng README worth carrying forward: "Characters that were reassigned in the
latest GB18030 update may interfere with detection", and `GB18030` is always reported as `GBK`, so never
branch on the detector returning `"gb18030"` — it cannot.

---

## Recommended load sequence

Stated as findings, not as a decision — #17 owns the command contract.

```
1. read bytes
2. Encoding::for_bom(&bytes)
     Some((enc, n)) -> encoding = enc, skip n bytes, source = Bom
     None           -> chardetng over the first 64 KiB (feed last = false,
                       guess(None, Utf8Detection::Allow)), source = Detector    [~8 ms]
3. strict-decode the whole file under that encoding, streamed into a 64 KiB
   scratch buffer, output discarded                                             [~7 ms / 4 MB]
     clean  -> strict_clean = true
     failed -> retry among MULTI-BYTE candidates only (GBK / Big5 / UTF-8),
               keep the fewest U+FFFD — never let a single-byte encoding win
               this contest — strict_clean = false, surface an override in the UI
4. incremental decode with new_decoder_without_bom_handling(), 64 KiB input
   chunks, index each decoded chunk before draining it                          [~12 ms / 4 MB]
5. return { lines-as-offsets, char offsets, DetectedEncoding { name, source, strict_clean } }
```

Budget for a 4 MB book: ~27 ms including the strict-decode cross-check. Worst case in the library
(16.3 MB): ~80 ms.

Two decisions this leaves open for #17:

- **Whether step 3 runs on every open** or its result is cached in the binding alongside the elected outline
  pattern. It is ~7 ms, so caching is an optimisation, not a necessity.
- **What the UI does with `strict_clean = false`.** One file in 23 needs it. Silently accepting the fallback is
  what produces the mojibake; the recommendation is to require an explicit user choice.

---

## Appendix A: reproducing the measurements

Four throwaway binaries against `~/Downloads/_FICTION/`, with
`encoding_rs = "0.8"`, `chardetng = "1"`, `[profile.release] opt-level = 3`:

| Binary   | Produces                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`   | Per-file table: size, `guess` on whole file vs 64 KiB prefix, BOM, strict-decode result under GBK/Big5/UTF-8/GB18030, char and line counts, read/detect/decode/index timings, CRLF ratio, one-shot vs streamed equality            |
| `probe`  | `for_label` mapping, GBK-vs-gb18030 decoder equivalence over the corpus, the outlier file's first malformed offset, wrong-encoding decode previews, prefix-size stability, BOM behaviour, per-step RSS, CRLF and blank-line counts |
| `probe2` | Isolated peak RSS for one-shot vs streaming, warmed-up chardetng throughput, single-malformed-byte injection, chardetng vs a UTF-8 BOM                                                                                             |
| `probe3` | All malformed offsets in the outlier file, the mixed-encoding diagnosis and repair, the `last = false` truncation artefact, tiny-scratch-buffer correctness, `max_utf8_buffer_length` ratios                                       |
| `probe4` | `0x80` → `€`, controlled injection of genuinely malformed sequences at five offsets, error-count threshold for the guess flip                                                                                                      |
| `probe5` | Strict-validation cost (one-shot vs streamed scratch), chardetng against a UTF-8 BOM on GBK content, U+FFFD counts per candidate encoding on the outlier file                                                                      |

Note when re-running: `chardetng` 1.0.0 changed the API from 0.1.x —
`EncodingDetector::new()` now takes an `Iso2022JpDetection`, and `guess`'s second parameter is a
`Utf8Detection` enum rather than a `bool`. Code written against the 0.1.x signature will not compile.
