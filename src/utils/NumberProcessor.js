/**
 * Unified Chinese Number Conversion System
 * Centralizes all number conversion logic with systematic pattern matching
 * Replaces ~90 lines of scattered number conversion with unified approach
 */

import { consumedSource } from './TranslationSourcePriority.js';

export class NumberProcessor {
  constructor() {
    // Single centralized number mapping (eliminates 5 duplicates)
    this.NUMBER_MAP = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      零: 0,
    };

    // Unified conversion patterns (ordered by precedence: longest first)
    this.CONVERSION_PATTERNS = [
      {
        name: 'fourDigitYear',
        regex:
          /([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])年/,
        converter: this.convertFourDigitYear.bind(this),
        description: 'Four-digit years like 一九四五年 (năm 1945), 二零二四年 (năm 2024)',
      },
      {
        name: 'thousandTenThousand',
        regex: /([一二两三四五六七八九])千万/,
        converter: this.convertThousandTenThousand.bind(this),
        description: 'Large numbers like 五千万 (50 million)',
      },
      {
        name: 'thousands',
        regex:
          /([一二两三四五六七八九])千(零[一二两三四五六七八九]十[一二三四五六七八九]?|零十[一二三四五六七八九]|零十|零[一二三四五六七八九]|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百零[一二三四五六七八九]|[一二两三四五六七八九]百|[一二两三四五六七八九]十[一二三四五六七八九]?|十[一二三四五六七八九]|十|[一二三四五六七八九])?/,
        converter: this.convertThousands.bind(this),
        description:
          'Thousands like 三千 (3000), 三千七百 (3700), 三千十五 (3,015). Handles implicit tens patterns.',
      },
      {
        name: 'percentageRange',
        regex: /百分之([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: this.convertPercentageRange.bind(this),
        description: 'Percentage ranges like 百分之五六十 (50-60%)',
      },
      {
        name: 'percentage',
        regex:
          /百分之([一二两三四五六七八九]千[一二两三四五六七八九]?百?[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|百|[一二两三四五六七八九]十[一二两三四五六七八九]|[一二两三四五六七八九]十|十[一二两三四五六七八九]|十|[一二两三四五六七八九]|\d+)(?:点([一二三四五六七八九零]+))?/,
        converter: this.convertPercentage.bind(this),
        description:
          'Percentages like 百分之三十 (30%), 百分之十五 (15%), 百分之两百 (200%), 百分之百 (100%, bare 百 with no leading digit), 百分之九十九点九 (99.9%). Decimal digits are read individually (点九九 → ".99", not positional).',
      },
      {
        name: 'tenThousandRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])万/,
        converter: (match, firstDigit, secondDigit) =>
          this.convertRange(match, firstDigit, secondDigit, { multiplier: 1, suffix: ' vạn' }),
        description: 'Ten thousand ranges like 七八万 (7-8 vạn)',
      },
      {
        name: 'thousandRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])千/,
        converter: (match, firstDigit, secondDigit) =>
          this.convertRange(match, firstDigit, secondDigit, { multiplier: 1, suffix: ' ngàn' }),
        description: 'Thousand ranges like 七八千 (7-8 ngàn)',
      },
      {
        name: 'hundredsRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])百/,
        converter: (match, firstDigit, secondDigit) =>
          this.convertRange(match, firstDigit, secondDigit, { multiplier: 100 }),
        description: 'Hundreds ranges like 四五百 (400-500)',
      },
      {
        name: 'hundredsPlusTensRange',
        regex: /([一二两三四五六七八九])百([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: this.convertHundredsPlusTensRange.bind(this),
        description: 'Hundreds plus tens ranges like 一百五六十 (150-160), 两百七八十 (270-280)',
      },
      {
        name: 'numberRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: (match, firstDigit, secondDigit) =>
          this.convertRange(match, firstDigit, secondDigit, { multiplier: 10 }),
        description: 'Number ranges like 五六十 (50-60), 七八十 (70-80) - validates logical ranges',
      },
      {
        name: 'teenAgeRange',
        regex: /十([一二两三四五六七八九])([一二两三四五六七八九])/,
        converter: this.convertTeenAgeRange.bind(this),
        description: 'Teen age ranges like 十六七 (16-17), 十二三 (12-13)',
      },
      {
        name: 'tensBasedRange',
        regex: /([二三四五六七八九])十([一二两三四五六七八九])([一二两三四五六七八九])/,
        converter: this.convertTensBasedRange.bind(this),
        description: 'Tens-based age ranges like 二十八九 (28-29), 三十四五 (34-35)',
      },
      {
        name: 'hundredsWithZero',
        regex: /([一二两三四五六七八九])百零([一二两三四五六七八九])/,
        converter: this.convertHundredsWithZero.bind(this),
        description: 'Hundreds with zero like 两百零六 (206), 三百零五 (305)',
      },
      {
        name: 'hundreds',
        regex:
          /([一二两三四五六七八九])百([一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九]十|十[一二两三四五六七八九]|[一二三四五六七八九])?/,
        converter: this.convertHundreds.bind(this),
        description:
          'Hundreds like 一百 (100), 三百五十 (350), 两百七十一 (271). Excludes 两 at final position.',
      },
      {
        name: 'tensPlusUnits',
        regex: /([一二两三四五六七八九])十([一二三四五六七八九])?/,
        converter: this.convertTensPlusUnits.bind(this),
        description:
          'Two-digit numbers like 三十 (30), 二十五 (25). Excludes 两 at final position to prevent unit confusion.',
      },
      {
        name: 'implicitTens',
        regex: /十([一二两三四五六七八九])/,
        converter: this.convertImplicitTens.bind(this),
        description: 'Numbers like 十七 (17), 十五 (15) where tens digit is implicit',
      },
      {
        name: 'standalone_ten',
        regex: /十/,
        converter: () => null, // Skip standalone 十 to allow phrase processing
        description: 'Skip 十 alone to allow phrases like 十字架',
      },
    ];
  }

  /**
   * Process number conversion for tokens using unified pattern matching
   * @param {Token[]} tokens - Array of tokens to process
   * @param {Object} options - Processing options
   */
  processTokens(tokens, options = {}) {
    const TokenType = { CHINESE_CHAR: 'chinese_char' }; // Import from TokenType if available

    // Process each token position for number patterns
    for (let i = 0; i < tokens.length; i++) {
      if (
        tokens[i].type !== TokenType.CHINESE_CHAR ||
        tokens[i].translated !== null ||
        tokens[i].translationSource
      ) {
        continue;
      }

      // Try to match number patterns starting from this position
      const matchResult = this.findLongestNumberMatch(tokens, i);

      if (matchResult) {
        // Apply conversion result to tokens
        this.applyConversionResult(tokens, i, matchResult, options);

        // Skip past the converted tokens
        i = matchResult.endIndex;
      }
    }
  }

  /**
   * Find the longest number match starting from a token position
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting position
   * @returns {Object|null} Match result or null
   */
  findLongestNumberMatch(tokens, startIndex) {
    let longestMatch = null;
    let longestMatchLength = 0;

    // Build test sequences of increasing length. Base case needs 8 tokens (七千七百七十七);
    // decimal percentages need more — the 'percentage' pattern's integer branch can consume
    // up to 7 chars (千百十 compound like 一千二百三十四), plus the 3-char 百分之 prefix, plus
    // 点, plus decimal digits (unbounded by the regex itself, e.g. 百分之一千二百三十四点五六
    // is 13 chars). Window sized generously past the worst-case integer+prefix+点 (11 chars)
    // to also leave room for several decimal digits.
    for (
      let endIndex = startIndex;
      endIndex < tokens.length && endIndex <= startIndex + 20;
      endIndex++
    ) {
      const token = tokens[endIndex];

      // Only consider Chinese characters
      if (token.type !== 'chinese_char' || token.translated !== null || token.translationSource) {
        break;
      }

      // Build test sequence from startIndex to endIndex
      const testSequence = tokens
        .slice(startIndex, endIndex + 1)
        .map((t) => t.value)
        .join('');

      const converted = this.convertSequence(testSequence);
      if (converted && testSequence.length > longestMatchLength) {
        longestMatch = {
          originalText: testSequence,
          ...converted,
          startIndex: startIndex,
          endIndex: endIndex,
        };
        longestMatchLength = testSequence.length;
      }
    }

    return longestMatch;
  }

  /**
   * Convert a whole numeral string with the first conversion pattern that
   * matches all of it and whose converter accepts the match.
   * @param {string} sequence - Chinese numeral text, e.g. "三十七"
   * @returns {{result: string, patternName: string, matchData: RegExpMatchArray}|null}
   */
  convertSequence(sequence) {
    for (const pattern of this.CONVERSION_PATTERNS) {
      const match = sequence.match(new RegExp('^' + pattern.regex.source + '$'));

      if (!match) continue;

      const result = pattern.converter(...match);

      // Skip if converter returned null (indicating invalid match)
      if (result === null) continue;

      return { result, patternName: pattern.name, matchData: match };
    }
    return null;
  }

  /**
   * Apply conversion result to tokens
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting index
   * @param {Object} matchResult - Match result object
   * @param {Object} options - Options including semanticArrayBuilder
   */
  applyConversionResult(tokens, startIndex, matchResult, options = {}) {
    // Set result on first token
    tokens[startIndex].translated = matchResult.result;
    tokens[startIndex].translationSource = 'number_conversion';

    // Mark consumed tokens
    for (let i = startIndex + 1; i <= matchResult.endIndex; i++) {
      tokens[i].translated = null;
      tokens[i].translationSource = consumedSource('number_conversion');
      tokens[i].groupLeader = startIndex;
    }

    // Add to semantic array builder if provided
    if (options.semanticArrayBuilder) {
      // Calculate global position accounting for chunk offset
      const globalTokenIndex = startIndex + (options.chunkOffset || 0);
      options.semanticArrayBuilder.addUnit(
        matchResult.originalText,
        matchResult.result,
        'number_conversion',
        globalTokenIndex,
        'number_conversion',
        null
      );
    }
  }

  /**
   * Convert four-digit years (e.g., 一九四五年 -> năm 1945)
   */
  convertFourDigitYear(match, digit1, digit2, digit3, digit4) {
    const num1 = this.NUMBER_MAP[digit1];
    const num2 = this.NUMBER_MAP[digit2];
    const num3 = this.NUMBER_MAP[digit3];
    const num4 = this.NUMBER_MAP[digit4];

    const year = num1 * 1000 + num2 * 100 + num3 * 10 + num4;
    return `năm ${year}`;
  }

  /**
   * Convert tens plus units (e.g., 三十五 -> 35)
   */
  convertTensPlusUnits(match, tens, units) {
    const tensValue = this.NUMBER_MAP[tens] * 10;
    const unitsValue = units ? this.NUMBER_MAP[units] : 0;
    return (tensValue + unitsValue).toString();
  }

  /**
   * Convert implicit tens (e.g., 十七 -> 17, 十五 -> 15)
   */
  convertImplicitTens(match, units) {
    const unitsValue = this.NUMBER_MAP[units];
    return (10 + unitsValue).toString();
  }

  /**
   * Convert hundreds with zero (e.g., 两百零六 -> 206, 三百零五 -> 305)
   */
  convertHundredsWithZero(match, hundreds, units) {
    const hundredsValue = this.NUMBER_MAP[hundreds] * 100;
    const unitsValue = this.NUMBER_MAP[units];
    return (hundredsValue + unitsValue).toString();
  }

  /**
   * Convert hundreds (e.g., 三百五十 -> 350). Delegates the whole match to
   * parseChineseNumber rather than re-deriving hundredsValue/remainder here — safe since
   * parseChineseNumber's internal hundreds regex now uses the same `(.*)` catch-all
   * remainder shape as the top-level CONVERSION_PATTERNS 'hundreds' regex that produced
   * this match (verified equivalent by differential test before this simplification
   * landed, 2026-08-29).
   */
  convertHundreds(match) {
    return this.parseChineseNumber(match).toString();
  }

  /**
   * True if a two-digit sequence (e.g. 五六 -> 5,6) is a valid ascending range pair.
   * Despite the "consecutive" wording in older comments here, this only requires
   * secondValue > firstValue — any ascending pair renders as a range (三八 -> "30-80"
   * is accepted same as 五六 -> "50-60"), not just adjacent digits. Shared by every
   * *Range converter below so the check can't drift between copies.
   */
  isAscendingRangePair(firstValue, secondValue) {
    return secondValue > firstValue;
  }

  /**
   * Format a validated ascending pair as a "X-Y" range string, scaling both endpoints
   * by `multiplier` (e.g. 10 for tens, 100 for hundreds) and appending `suffix`.
   */
  formatRangeString(firstValue, secondValue, multiplier = 1, suffix = '') {
    return `${firstValue * multiplier}-${secondValue * multiplier}${suffix}`;
  }

  /**
   * Shared core for the 4 range converters whose whole difference is a
   * multiplier/suffix pair: ten-thousand ranges (七八万 -> 7-8 vạn), thousand
   * ranges (七八千 -> 7-8 ngàn), hundreds ranges (四五百 -> 400-500), and plain
   * number ranges (五六十 -> 50-60). Only converts if the digits form a logical
   * ascending range. `convertTeenAgeRange`/`convertTensBasedRange` are NOT this
   * shape — they add an offset before the ascending check and take a third
   * capture group, a different formula, not a parameter substitution of this one
   * (architecture review 2026-09-09, candidate #3 grilling).
   */
  convertRange(match, firstDigit, secondDigit, { multiplier = 1, suffix = '' } = {}) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;
    return this.formatRangeString(firstValue, secondValue, multiplier, suffix);
  }

  /**
   * Convert hundreds plus tens range (e.g., 一百五六十 -> 150-160)
   * Only converts if the digits form a logical ascending range
   */
  convertHundredsPlusTensRange(match, hundreds, firstDigit, secondDigit) {
    const hundredsValue = this.NUMBER_MAP[hundreds] * 100;
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;

    const firstTotal = hundredsValue + firstValue * 10;
    const secondTotal = hundredsValue + secondValue * 10;
    return `${firstTotal}-${secondTotal}`;
  }

  /**
   * Convert number ranges (e.g., 五六十 -> 50-60)
   * Only converts if the digits form a logical ascending range
   */
  convertNumberRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;
    return this.formatRangeString(firstValue, secondValue, 10);
  }

  /**
   * Convert teen age ranges (e.g., 十六七 -> 16-17)
   */
  convertTeenAgeRange(match, firstUnits, secondUnits) {
    const firstValue = 10 + this.NUMBER_MAP[firstUnits];
    const secondValue = 10 + this.NUMBER_MAP[secondUnits];
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;
    return `${firstValue}-${secondValue}`;
  }

  /**
   * Convert tens-based age ranges (e.g., 二十八九 -> 28-29)
   */
  convertTensBasedRange(match, tens, firstUnits, secondUnits) {
    const tensValue = this.NUMBER_MAP[tens] * 10;
    const firstValue = tensValue + this.NUMBER_MAP[firstUnits];
    const secondValue = tensValue + this.NUMBER_MAP[secondUnits];
    // BUG FIX: every other *Range converter validates ascending order before accepting
    // the pair; this one didn't, so e.g. 二十八三 (tens=2, units 8 then 3) previously
    // produced the nonsensical descending "28-23" instead of being rejected.
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;
    return `${firstValue}-${secondValue}`;
  }

  /**
   * Convert thousands (e.g., 三千七百 -> 3700, 二千五百三十 -> 2530). Delegates to
   * parseChineseNumber the same way convertHundreds does — see that method's comment.
   * Excludes patterns ending with 两 (e.g., 三千两, 一千零两)
   */
  convertThousands(match) {
    return NumberProcessor.formatWithCommas(this.parseChineseNumber(match));
  }

  /**
   * Convert large numbers (e.g., 一千万 -> 10,000,000, 五千万 -> 50,000,000)
   */
  convertThousandTenThousand(match, digit) {
    const thousands = this.NUMBER_MAP[digit] * 1000;
    const tenThousands = thousands * 10000; // 千万 = thousands × 10,000
    return NumberProcessor.formatWithCommas(tenThousands);
  }

  static formatWithCommas(n) {
    const s = String(n);
    return s.length > 3 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
  }

  /**
   * Convert percentage ranges (e.g., 百分之五六十 -> 50-60%)
   */
  convertPercentageRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    if (!this.isAscendingRangePair(firstValue, secondValue)) return null;
    return this.formatRangeString(firstValue, secondValue, 10, '%');
  }

  /**
   * Convert percentages with unified number parsing (e.g., 百分之三十 -> 30%)
   * Optional decimal suffix (e.g., 百分之九十九点九 -> 99.9%). Decimal digits are read
   * individually in Chinese (点九九 = "point nine nine"), not positionally like the
   * integer part (十/百/千) — so they're mapped digit-by-digit and string-concatenated,
   * never passed through parseChineseNumber.
   */
  convertPercentage(match, number, decimalDigits) {
    // Extract the number part after "百分之" (strip any decimal suffix first — parsing
    // the integer part must not see the raw 点... text)
    const integerPart = number;
    let value = 0;

    if (integerPart === '百') {
      // Bare 百 has no leading digit for parseChineseNumber to key off (it'd return 0) —
      // 百分之百 means "(one) hundred percent of" = 100%.
      value = 100;
    } else if (/^\d+$/.test(integerPart)) {
      // Handle already converted numbers (digits)
      value = parseInt(integerPart);
    } else {
      // Parse Chinese number
      value = this.parseChineseNumber(integerPart);
    }

    if (decimalDigits) {
      const decimalString = decimalDigits
        .split('')
        .map((c) => this.NUMBER_MAP[c])
        .join('');
      return `${value}.${decimalString}%`;
    }

    return `${value}%`;
  }

  /**
   * Resolve a thousands/hundreds remainder capture to its numeric value.
   * Chinese uses short-form truncation for a bare trailing digit — 三千三 means 三千三百
   * (missing 百 implied), 三百三 means 三百三十 (missing 十 implied) — so a single-char
   * remainder is scaled by `shortFormMultiplier` (100 for thousands, 10 for hundreds)
   * instead of being parsed as a standalone units digit. A multi-char remainder (e.g.
   * "七百" after 千, "五十" after 百) is spelled out in full and recurses normally.
   * @param {string|undefined} remainder - Captured remainder text, or falsy for none
   * @param {number} shortFormMultiplier - 100 after 千, 10 after 百
   * @returns {number}
   */
  resolveRemainderValue(remainder, shortFormMultiplier) {
    if (!remainder) return 0;
    return /^[一二三四五六七八九]$/.test(remainder)
      ? this.NUMBER_MAP[remainder] * shortFormMultiplier
      : this.parseChineseNumber(remainder);
  }

  /**
   * Unified Chinese number parsing (eliminates duplicate logic)
   * @param {string} chineseNumber - Chinese number string
   * @returns {number} Parsed numeric value
   */
  parseChineseNumber(chineseNumber) {
    if (!chineseNumber) return 0;

    // Handle thousands patterns like 一千两百 (1200), 三千五百 (3500), 一千零二十四 (1024)
    // Remainder is a bare `(.*)` catch-all (mirrors wasm-core/number_processor.rs's
    // THOUSANDS_RE), not an enumerated alternation — an enumerated list here previously
    // drifted from the top-level CONVERSION_PATTERNS 'thousands' regex (which is the one
    // that actually decides how much text to consume) and silently truncated compound
    // numbers like 三千二百十五 to 3200, dropping the trailing 十五 (see resolveRemainderValue
    // below, which still handles the short-form-truncation special case on whatever this
    // captures). Fixed 2026-08-29 — see wasm-core/CLAUDE.md.
    if (chineseNumber.includes('千')) {
      const thousandsMatch = chineseNumber.match(/([一二两三四五六七八九])千(.*)/);
      if (thousandsMatch) {
        const thousandsValue = this.NUMBER_MAP[thousandsMatch[1]] * 1000;
        return thousandsValue + this.resolveRemainderValue(thousandsMatch[2], 100);
      }
    }

    // Handle hundreds patterns like 七百 (700), 三百五十 (350), 两百零六 (206)
    if (chineseNumber.includes('百')) {
      // Check for hundreds with zero first (longer pattern)
      const hundredsZeroMatch = chineseNumber.match(
        /([一二两三四五六七八九])百零([一二两三四五六七八九])/
      );
      if (hundredsZeroMatch) {
        const hundredsValue = this.NUMBER_MAP[hundredsZeroMatch[1]] * 100;
        const unitsValue = this.NUMBER_MAP[hundredsZeroMatch[2]];
        return hundredsValue + unitsValue;
      }

      // Check for regular hundreds (exclude 两 at final position). Bare `(.*)` remainder —
      // see the matching comment on the thousands block above for why.
      const hundredsMatch = chineseNumber.match(/([一二两三四五六七八九])百(.*)/);
      if (hundredsMatch) {
        const hundredsValue = this.NUMBER_MAP[hundredsMatch[1]] * 100;
        return hundredsValue + this.resolveRemainderValue(hundredsMatch[2], 10);
      }
    }

    // Handle zero + tens patterns like 零二十四 (24) first (longest pattern)
    if (chineseNumber.includes('零') && chineseNumber.includes('十')) {
      const zeroTensMatch = chineseNumber.match(
        /^零([一二两三四五六七八九])?十([一二三四五六七八九])?$/
      );
      if (zeroTensMatch) {
        const tensValue = zeroTensMatch[1] ? this.NUMBER_MAP[zeroTensMatch[1]] * 10 : 10;
        const unitsValue = zeroTensMatch[2] ? this.NUMBER_MAP[zeroTensMatch[2]] : 0;
        return tensValue + unitsValue;
      }
    }

    // Handle tens patterns like 三十 (30) or 三十五 (35) or 五十 (50) (exclude 两 at final position)
    if (chineseNumber.includes('十')) {
      // First check for standard tens pattern with digit before 十
      const tensMatch = chineseNumber.match(/([一二两三四五六七八九])十([一二三四五六七八九])?/);
      if (tensMatch) {
        const tensValue = this.NUMBER_MAP[tensMatch[1]] * 10;
        const unitsValue = tensMatch[2] ? this.NUMBER_MAP[tensMatch[2]] : 0;
        return tensValue + unitsValue;
      }

      // Handle 十 + digit patterns (like 十三 = 13, 十五 = 15)
      const tensPlusMatch = chineseNumber.match(/^十([一二三四五六七八九])$/);
      if (tensPlusMatch) {
        const unitsValue = this.NUMBER_MAP[tensPlusMatch[1]];
        return 10 + unitsValue;
      }

      // Handle standalone 十 (just 10)
      if (chineseNumber === '十') {
        return 10;
      }
    }

    // Zero + single digit (e.g. 零六 = 6) — remainder after 千/百
    if (chineseNumber.length === 2 && chineseNumber[0] === '零') {
      return this.NUMBER_MAP[chineseNumber[1]] || 0;
    }

    // Handle single digit
    return this.NUMBER_MAP[chineseNumber] || 0;
  }
}
