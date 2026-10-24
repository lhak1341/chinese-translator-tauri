# Unsupervised Chinese new-word discovery: survey

Answers issue #36 (child of map issue #35). Date: 2026-10-24.

Goal: find candidate proper nouns of 2-8 characters (names, places, organizations, techniques, objects, creatures) in an unsegmented multi-megabyte Chinese novel, excluding strings already in dictionaries.

## How to read the evidence tags

- **[read]** I opened the paper's text and the claim is in it.
- **[abstract]** Only the abstract or bibliographic record was visible to me.
- **[derived]** My own arithmetic or reasoning from [read] facts. Not a published result. Verify before relying on it.
- **[not opened]** I know the paper exists. I did not read it, and I make no claim from it.

All papers below are from the ACL Anthology, MIT Press, or the authors' hosts. No blog or secondary write-up is used for a claim.

## Sources

| Id       | Source                                                                                                                                                                                                  | Status                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Feng04   | Feng, Chen, Deng, Zheng. "Accessor Variety Criteria for Chinese Word Extraction." Computational Linguistics 30(1):75-93, 2004. https://aclanthology.org/J04-1004/                                       | read                                    |
| Jin06    | Jin, Tanaka-Ishii. "Unsupervised Segmentation of Chinese Text by Use of Branching Entropy." COLING/ACL 2006 posters, pp. 428-435. https://aclanthology.org/P06-2056/                                    | read                                    |
| Zhikov10 | Zhikov, Takamura, Okumura. "An Efficient Algorithm for Unsupervised Word Segmentation with Branching Entropy and MDL." EMNLP 2010, pp. 832-842. https://aclanthology.org/D10-1081/                      | read                                    |
| YC01     | Yamamoto, Church. "Using Suffix Arrays to Compute Term Frequency and Document Frequency for All Substrings in a Corpus." Computational Linguistics 27(1):1-30, 2001. https://aclanthology.org/J01-1001/ | read                                    |
| CH90     | Church, Hanks. "Word Association Norms, Mutual Information, and Lexicography." Computational Linguistics 16(1):22-29, 1990. https://aclanthology.org/J90-1003/                                          | read                                    |
| Bouma09  | Bouma. "Normalized (Pointwise) Mutual Information in Collocation Extraction." GSCL 2009, pp. 31-40. https://svn.spraakdata.gu.se/repos/gerlof/pub/www/Docs/npmi-pfd.pdf                                 | read                                    |
| Abou04   | Abouelhoda, Kurtz, Ohlebusch. "Replacing suffix trees with enhanced suffix arrays." Journal of Discrete Algorithms 2:53-86, 2004. DOI 10.1016/S1570-8667(03)00065-0                                     | abstract and search snippets only       |
| Okan09   | Okanohara, Tsujii. "Text Categorization with All Substring Features." SIAM SDM 2009, pp. 838-846.                                                                                                       | abstract only (via search snippet)      |
| esaxx    | Okanohara. esaxx library, https://github.com/TNishimoto/esaxx (README)                                                                                                                                  | read (README)                           |
| Harris55 | Harris. "From Phoneme to Morpheme." Language 31(2):190-222, 1955.                                                                                                                                       | cited by Jin06 and Zhikov10, not opened |

Also not opened, and not used for any claim: Huang and Powers 2003 (Chinese word segmentation based on contextual entropy, PACLIC 17, cited in Zhikov10), Sproat and Shih 1990, Sun et al. 1998, Chang and Su 1997.

## Short answer

Use three signals, each from a suffix array over the whole book, and combine them with AND:

1. **Frequency floor and closure.** Enumerate only strings that repeat and that are maximal repeats (see "Avoiding substrings" below). This cuts the candidate list before any scoring.
2. **Boundary (accessor variety or branching entropy).** Score the left and right edges separately and take the minimum. Catches "string ends where a word ends".
3. **Cohesion (PMI-style).** Score how tightly the inside holds together, using the weakest split point. Catches "string is not two words glued together".

Each fails where another works. Cohesion alone accepts frequent glued pairs ("的" plus noun). Boundary alone accepts a real word plus a function character ("的人"). Frequency alone accepts both.

## 1. Cohesion measures

**Pointwise mutual information (PMI).** For a pair, `log p(x,y) / (p(x) p(y))`. Introduced to lexicography as the "association ratio" in CH90 [read]. CH90 itself drops rare pairs: "we will adopt the simple but arbitrary threshold, and ignore pairs with small counts" [read]. So the frequency floor is as old as the measure.

**Known weakness: low-count bias.** Bouma09 states that PMI has "a known sensitivity for low frequency data", and that for perfectly correlated words the upper bound is `-ln p(x,y)`, so "the PMI of perfectly correlated words is higher when the combination is less frequent" [read]. In a novel this bites directly: a name seen twice scores higher than one seen two hundred times.

**Normalized PMI (NPMI).** Bouma09 divides PMI by `-ln p(x,y)` to get a fixed maximum of 1 and, in his words, "it is hoped that this move will also reduce some of the low frequency bias" [read]. The hedge matters: it reduces the bias, it does not remove it. The formula and the [-1, 1] range are in the paper's section 3; I confirmed the motivation text and the `-ln p(x,y)` bound, not every line of the derivation.

**Extension to strings longer than two parts.** YC01 gives MI for a string `xYz` as `log( tf(xYz) tf(Y) / (tf(xY) tf(Yz)) )` plus a corpus-size term, with tokens `x`, `z` and a middle `Y` [read]. That is one split. For a 2-8 character candidate there are 1 to 7 split points. The standard move is to score every split and keep the minimum (the weakest link). **I did not find that "minimum over splits" rule stated in any of the papers I read**, so treat it as a design choice, not a cited method. [derived]

**What PMI is good and bad at.** YC01 reports that MI "tends to pick out phrases with noncompositional semantics" and RIDF "tends to highlight technical terminology, names" and that the combination "is better than either by itself in a Japanese word extraction task" [read, abstract]. They also found "little if any correlation" between MI and RIDF on their samples [read]. That is direct support for combining independent signals.

**Cost.** Needs `tf` of the whole string, of its prefix, and of its suffix (YC01 formula) [read]. With a suffix array each `tf` is a binary search, `O(m log N)` for a pattern of length `m` (standard suffix-array fact; Zhikov10 quotes `O(t n log m)` for `t` queries of order `n` against a corpus of size `m` [read]). No other cost is incurred.

## 2. Boundary measures

### Accessor variety (AV)

Defined in Feng04 [read]:

- `AV(s) = min{Lav(s), Rav(s)}`.
- `Lav(s)` = number of distinct characters directly before `s`, plus the number of distinct sentences in which `s` appears at the start. `Rav` mirrors this for the right.
- Sentence start and end are therefore counted as extra "characters", so a name that only ever opens a sentence still gets credit.
- A string is kept if `AV >= threshold`.

Reported results [read], all on People's Daily and Xinhua text, strings of length 1-10:

| Corpus                            | Threshold | Precision | Words found | Partial recall |
| --------------------------------- | --------- | --------- | ----------- | -------------- |
| 1.7 MB, 55,788 sentences          | 2         | 64.4%     | 37,093      | 76.7%          |
| 1.7 MB                            | 3         | 83.8%     | 14,468      | 66.5%          |
| 1.7 MB                            | 5         | 94.1%     | 6,147       | 54.3%          |
| 1.7 MB                            | 9         | 97.7%     | 2,734       | 41.5%          |
| 153 MB, about 7 million sentences | 2         | 51.2%     | 2,854,700   | n/a            |
| 153 MB                            | 9         | 73.4%     | 249,904     | 80.4% (text)   |

Three lessons for a single novel:

- **The 1.7 MB result is the relevant scale.** A novel is closer to it than to 153 MB. Precision rose with threshold from 64% to 98% while recall fell from 77% to 42%. So AV has a clean precision/recall dial, and a book needs a low threshold (3-5), not a high one.
- **Large corpora need higher thresholds.** Feng04 says that in the 153 MB corpus "many characters have the chance to occur together to form spurious words", so the same threshold gave lower precision [read]. Do not copy a threshold tuned on 100 MB newswire.
- **Low-frequency words are reachable.** Feng04 states the method "has the ability to extract low-frequency words" and gives a word that "occurs only three times" [read]. AV does not need a count floor beyond the threshold itself, because `AV <= count`.

**Per-length precision** (1.7 MB, threshold 3) [read]: length 2: 90.2%, 3: 56.6%, 4: 91.4%, 5: 85.1%, 6: 90.4%, 7: 89.4%, 8: 90.1%, 9: 80.3%. Length 3 is the outlier because "three-character strings are often constructed from a two-character legitimate word together with a single character". Long strings (5-8) held at 85-90%. Feng04 also claims AV is "comparable to, and for long words outperforms, other iterative methods" [read, abstract].

**Adhesive characters.** Feng04 identifies characters such as the particle 的 that stick to words and produce a high AV without making a word (its example: "of people" has high AV because many adjectives precede "people"). It strips strings of the form head-adhesive + core, core + tail-adhesive, or both [read]. For a novel the same trap exists for 的, 了, 他, 她, 说, 道, and honorifics. A stop-character list used to strip or reject candidate edges is a direct, cheap port.

**Cost.** One pass over the suffix array and its LCP array gives, for each repeat, the set of left characters and right characters. The paper does not describe its data structure, so I make no claim about its cost. [derived: see section 5]

### Branching entropy (BE)

Idea from Harris55 (distinct successor count peaks at a morpheme boundary) [cited in Jin06, not opened]. Jin06 uses entropy instead of count [read]:

- `H(X | X_n) = -sum P(x_n) sum_x P(x | x_n) log P(x | x_n)`, computed for the next character after each prefix.
- Inside a word, entropy of the next character falls as the prefix grows. At a word boundary it rises.
- Boundary rules tested: `B_max` (local maximum), `B_increase` (rise greater than `val_delta`), `B_ordinary` (above a fixed threshold). `B_increase` and `B_max` kept higher precision than `B_ordinary`. With `val_delta = 0.0`, precision 0.88 and recall 0.79 [read].
- Run both forward and backward and take the union of boundaries [read].
- Training text 200 MB, test text 1 MB: precision about 90%, recall about 80% [read, abstract].
- **Precision stayed around 90% even when the entropy was estimated from a 10 KB corpus. Only recall depended on data size**, rising roughly linearly on a log-size axis [read].
- They only used n-grams up to **6** characters ("we only took 6-grams out of the learning data") [read].

Note: Jin06 solves segmentation, not candidate extraction. Using it for candidates means scoring a candidate by the entropy at its left and right edges and, optionally, requiring the rise-then-fall shape inside. That adaptation is mine. [derived]

Zhikov10 reuses branching entropy to prune the search space of an MDL segmenter and reports accuracy comparable to Bayesian methods "in a significantly reduced computational time". Its text uses suffix arrays for the statistics, with `O(t n log m)` lookup cost, "faster implementations reduce the complexity to `O(t(n + log m))`" [read]. Evaluated on Japanese, Thai, English and CHILDES, not Chinese. [read, abstract]

### AV versus BE

|                        | Accessor variety                       | Branching entropy                                   |
| ---------------------- | -------------------------------------- | --------------------------------------------------- |
| Statistic              | distinct neighbour count               | entropy of neighbour distribution                   |
| Weighted by frequency  | no                                     | yes                                                 |
| Small-sample behaviour | bounded by count, easy to reason about | entropy of 2 observations is at most `log 2`; noisy |
| Sentence edges         | explicit rule (S, E counted)           | not specified in Jin06                              |
| Typical use            | accept/reject a candidate string       | place cuts inside a text                            |

A repeated name with 3 contexts, each used once, has AV 3 and entropy `log 3`. A function-word pair with 3 contexts of counts 1000, 1, 1 has AV 3 but entropy near 0. Entropy is the better filter for "looks diverse but is really one dominant neighbour" (a name always followed by 说), AV for tiny counts. [derived]

## 3. Maximal repeats and suffix arrays

**Equivalence classes.** YC01 shows how to get `tf` (and `df`) for all `N(N+1)/2` substrings of an `N`-character corpus in `O(N log N)` time by grouping them into "at most `2N - 1` equivalence classes" over intervals of the suffix array and its LCP array. All members of a class share `tf` [read]. The class's longest member is the representative. They built it for 216 million characters of Japanese: "a few hours on a MIPS10000 with 16 Gbytes", dominated by suffix array construction [read]. Their table counts 10 million classes for 15 million substrings in that corpus [read].

**Worst case.** If the text has long repeated substrings (duplicated articles), naive suffix sorting goes quadratic. YC01 reports giving up on the simple sort after 50 hours of CPU on an English corpus and finishing in 2 hours with the Manber-Myers algorithm [read]. A web-novel with copied chapter headers, author notes, or repeated paragraphs is exactly that shape. Use a linear-time or `O(N log N)` construction (SA-IS or similar), not `sort()` with string comparison.

**Maximal repeats.** A maximal repeat is a repeated substring that cannot be extended left or right without losing occurrences. Abou04's abstract states that enhanced suffix arrays can replace suffix trees at the same time complexity for such algorithms, and its application table lists maximal repeats among bottom-up traversal problems [abstract and snippets, not opened in full].

**Libraries.** Okanohara's esaxx README: builds an enhanced suffix array in `O(N)` time using `20N` bytes, and ships `enumMaximalSubstring` [read]. Okan09's abstract says effective substrings can be found by "checking only maximal substrings", enumerable in linear time with enhanced suffix arrays [abstract only]. Note that Okan09's "maximal substring" is the one whose occurrence count drops when you append a character to either end (secondary description from search results, not verified in the paper).

**Link between maximal repeat and AV.** A repeated string is a maximal repeat when its occurrences have at least two distinct left characters and at least two distinct right characters. That is `AV >= 2`, ignoring Feng04's extra sentence-edge credit. So a maximal-repeat enumeration is AV with threshold 2 as a free by-product. [derived from the two definitions]

## 4. Sparse counts for long (5-8 character) strings

Honest summary: **the published systems I read do not smooth. They limit, threshold, or avoid the problem.**

| System   | What it does about sparsity                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jin06    | Caps n-gram order at 6; uses a boundary rule on entropy differences; reports precision stable on 10 KB, with recall the casualty [read]                                                        |
| Feng04   | No smoothing. Uses a distinct-neighbour count that cannot exceed the frequency, so a rare string simply cannot reach a high threshold. Reports a word occurring three times being found [read] |
| CH90     | Drops pairs with small counts at a fixed threshold [read]                                                                                                                                      |
| Bouma09  | Normalises PMI to dampen the low-frequency inflation; acknowledges it is only a reduction [read]                                                                                               |
| YC01     | Computes statistics for all substrings, no smoothing; shows MI and RIDF range widely for long strings [read]                                                                                   |
| Zhikov10 | Branching entropy only to prune hypotheses; segmentation chosen by MDL, which charges for each new word [read]                                                                                 |

Practical rules that follow, each tagged:

- **Hard frequency floor of 2 for 5-8 character strings.** A string seen once has no evidence of cohesion or of boundary variety. AV and every maximal-repeat method already exclude it. [read: Feng04 notes that words occurring once fall below threshold 2]
- **Do not trust PMI on long strings alone.** With `tf(s) = 2` and `tf(prefix) = tf(suffix) = 2`, PMI is large by construction (Bouma09's bound). Use NPMI or require `tf >= 3` for cohesion scoring. [derived from Bouma09]
- **Back off to the weakest split.** Score a long candidate by its weakest split. Splits of a long string produce short parts with big counts, so the denominator is well estimated even though the numerator is small. [derived]
- **Prefer AV (or a count-bounded entropy) as the gate for rare strings.** It is directly bounded by count. [read for AV, derived for the recommendation]
- **Accept low recall on the rarest names.** Jin06's data shows precision survives small data and recall is what you lose [read]. A name that appears once in a book cannot be found by any method here. Flag it in a different way (for example, matching a title or honorific pattern), not by statistics.

I found no published Chinese-specific treatment that estimates long-string probabilities with backoff or Good-Turing for this task in the sources I read. If one exists in the items I did not open, it is not covered here.

## 5. Cost on a multi-megabyte book

All figures in this section are estimates from the sources' stated complexity, not measurements on this repo. [derived] Measure on the real library before trusting any of it.

Assumptions: a 5 MB UTF-8 Chinese file is about 1.7 million characters (3 bytes per character). `N` below is characters after dropping non-Chinese characters. Sentences split at punctuation, so no candidate crosses a sentence.

| Step                                                  | Time                                                    | Memory                                               | Notes                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Suffix array, 32-bit ints                             | `O(N)` to `O(N log N)` (YC01; esaxx README says `O(N)`) | 4N bytes for SA, 4N for LCP; about 14 MB at N = 1.7M | esaxx quotes `20N` bytes for its full structure: about 34 MB                                                     |
| Walk LCP intervals, collect length 2-8 repeat classes | `O(N)` plus work per class                              | at most `2N - 1` classes (YC01)                      | YC01: 15 million substrings fell into 10 million classes on 216M characters, so expect on the order of N classes |
| Distinct left/right neighbours per class (AV)         | `O(class size)` per class                               | small                                                | Needs the occurrence list or a traversal that merges child sets                                                  |
| `tf` of prefix and suffix for each split (PMI)        | `O(m log N)` per lookup; up to 7 splits                 | none beyond SA                                       | For millions of candidates, run only after AV and frequency filters                                              |
| Branching entropy per candidate                       | same as AV, plus counting neighbour frequencies         | small                                                |                                                                                                                  |

A rough upper bound on candidate strings, before any filter: each position starts at most 7 strings of length 2-8, so under `7 * N` is about 12 million occurrences, far fewer distinct. Requiring a repeat (count of 2 or more) removes most. Compare Feng04's 1.7 MB run which yielded 37,093 words at threshold 2 and 14,468 at threshold 3, from strings of length 1-10 [read]. So expect tens of thousands of surviving candidates before dictionary exclusion, not millions. [derived]

Conclusion: this is seconds to low tens of seconds in native code and not a scaling problem at 1.7M characters. The risk is the worst case, repeated long substrings, not the size. [derived]

WASM note for this repo: the project already ships a Rust `wasm-core` crate. I did not check whether a suffix-array crate is already a dependency and did not look at the codebase for this survey.

## 6. How the signals complement each other

| Failure                                                     | Which signal catches it                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Frequent glued pair (word + 的 / 了)                        | cohesion: weakest split is low; boundary: one side has a dominant neighbour          |
| Word plus suffix character (Feng04's adhesive characters)   | adhesive-character strip or entropy at the edge                                      |
| Substring of a longer name                                  | closure test, see section 7                                                          |
| Rare real name seen 2-3 times                               | AV with low threshold; cohesion unreliable here                                      |
| Real term with fixed context (a name always followed by 说) | cohesion passes, AV may fail; entropy tells you the context is dominant, not diverse |
| Fixed idiom or title phrase                                 | cohesion high, boundary low: report as a phrase candidate, not a noun                |

Evidence for combination: YC01 found MI and RIDF largely uncorrelated and better combined [read]. Feng04 combined AV with the adhesive-character rule [read]. Jin06 combined forward and backward passes [read]. All three show that one signal alone leaves a stated error class.

## 7. Avoiding substrings of longer repeats

Problem: if "张无忌" is a name, then "张无", "无忌", "张无忌说" all repeat. Each of the shorter ones has at least as high a count. Scoring them independently reports all of them.

Mechanisms from the sources:

1. **Equivalence classes (YC01).** Within a class every member has the same `tf`, and the class is defined by one interval. Keep only the class's longest member. This removes "张无" when it always occurs inside "张无忌". [read]
2. **Maximal repeat filter.** Keep a string only if it has at least 2 distinct left and at least 2 distinct right neighbours. Strings that always extend the same way are dropped. This is `AV >= 2`. [read for the definitions, derived for the equivalence]
3. **Boundary score on each end (Feng04, Jin06).** "张无" has right neighbour 忌 almost always: AV 1 on the right, so it fails. [read]
4. **Adhesive stripping (Feng04).** Handles the other direction: a real word with a function-word tail ("张无忌的") passes AV but is stripped. [read]

What the sources do not cover, and the tool must decide itself [derived]:

- **Nested real words with different counts.** "张无忌" appears 500 times; "张无忌说" appears 80 times with a real AV. Closure (same count) will not drop it. Rule: drop the longer string when most of its occurrences are followed by one character (dominant-neighbour test), or when the short string's count outside the long string is small.
- **Names that really are substrings of other names** (a given name used alone, "无忌"). Report as a separate candidate only if it has a large number of occurrences not inside the longer one. Count outside-occurrences with the suffix array.
- I know of a term-extraction method for this (nested-term counting, Frantzi et al.'s C-value) but I did not open it, so I do not cite it as evidence.

## 8. Recommended pipeline for the tool

1. Normalize text: keep Chinese characters; cut at punctuation and line breaks so no candidate spans a sentence. Record sentence start and end for AV.
2. Build suffix array and LCP over the cut text. Use a construction that is safe on long repeats.
3. Enumerate LCP-interval classes with length 2-8 and count 2 or more.
4. Closure: keep the longest member of each equal-frequency class (YC01).
5. Boundary gate: AV with S/E credit, threshold 3 to start (Feng04 table, 1.7 MB: 83.8% precision at 3, 94.1% at 5). Add an entropy check for dominant-neighbour cases.
6. Adhesive-character strip (Feng04) using a Chinese function-character list. Needs a tuned list for fiction (他, 她, 说, 道, 的, 了, 着).
7. Cohesion gate: NPMI over the weakest split, only for `tf >= 3`.
8. Exclude strings found in the dictionaries (by exact match, and by dictionary entry that is a strict substring or superstring, because that case was not covered by any source).
9. Rank by combined score. Present top-N for human review. Measure precision on a hand-labeled chapter before choosing thresholds.

Thresholds above come from Feng04's newswire results and are starting points, not tuned values. Newswire and fiction differ in name density and sentence length.

## 9. Gaps and caveats

- No measured timings on a novel. Section 5 is arithmetic.
- No source I read evaluates on fiction. Feng04 and Jin06 use newswire.
- Feng04's precision numbers are from human judgment of random samples of the output, as the paper describes; they measure "is a word" in the paper's sense, not "is a proper noun".
- Jin06 and Zhikov10 solve segmentation. Their transfer to candidate extraction is my adaptation.
- Abou04 and Okan09 were not read beyond abstracts or search snippets.
- Huang and Powers 2003, Sproat and Shih 1990, Sun et al. 1998, and Chang and Su 1997 were not opened.
- The "minimum over split points" PMI rule is a common practitioner choice that I did not trace to a primary source here.
