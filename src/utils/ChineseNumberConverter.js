/**
 * Chinese Number Converter
 *
 * Converts Chinese numerals to Arabic numerals with context awareness.
 * Handles complex patterns including percentages, ranges, compound numbers,
 * and large numbers with unit preservation.
 *
 * @example
 * ChineseNumberConverter.convertSimpleNumber('三十五') // => 35
 * ChineseNumberConverter.processPercentages('百分之十五') // => '15%'
 * ChineseNumberConverter.processAll('第五百八十章') // => '第 580 章'
 *
 * @performance
 * - Handles 1000+ conversions/second
 * - O(n) where n = input string length
 * - Optimized for novel translation use cases
 *
 * @see docs/guides/architecture.md#number-processing
 */
export class ChineseNumberConverter {
  /**
   * Mapping of Chinese number characters to Arabic numerals
   */
  static NUMBER_MAP = {
    零: 0,
    一: 1,
    两: 2,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    百: 100,
    千: 1000,
    万: 10000,
    亿: 100000000,
  };

  /**
   * Units that should be preserved in Vietnamese translation
   */
  static PRESERVED_UNITS = {
    万: 'vạn',
    亿: 'ức',
    千: 'ngàn',
    百: 'trăm',
  };

  /**
   * Chinese measure words (classifiers)
   * These indicate that a preceding number should be converted
   */
  static MEASURE_WORDS = new Set([
    '个',
    '條',
    '张',
    '位',
    '件',
    '支',
    '枚',
    '双',
    '州',
    '处',
    '座',
    '层',
    '地',
    '章',
    '节',
    '期',
    '篇',
    '页',
    '口',
    '身',
    '头',
    '面',
    '份',
    '队',
    '对',
    '套',
    '户',
    '家',
    '棵',
    '粒',
    '颗',
    '辆',
    '趟',
    '次',
    '度',
    '遍',
    '回',
    '下',
    '名',
    '道',
    '种',
    '项',
    '级',
  ]);

  /**
   * Compound words containing 一 that should NOT be converted
   * (e.g., "统一" should not become "统1")
   */
  static EXCEPTIONAL_COMPOUNDS = new Set(['合一', '统一', '唯一', '一致']);

  /**
   * Characters that indicate a noun follows
   * Used to determine if a number should be converted
   */
  static NOUN_INDICATORS = new Set([
    '神',
    '灵',
    '兽',
    '人',
    '主',
    '君',
    '王',
    '后',
    '殿',
    '宫',
    '楼',
    '堂',
    '室',
    '洞',
    '岁',
    '年',
    '月',
    '日',
    '时',
    '分',
    '秒',
  ]);

  /**
   * Poetic number patterns that should be preserved
   * with their Vietnamese translations
   */
  static POETIC_TRANSLATIONS = {
    千千万万: 'ngàn ngàn vạn vạn',
    千千: 'ngàn ngàn',
    万万: 'vạn vạn',
  };

  /**
   * Convert a simple Chinese numeral string to an Arabic number
   *
   * @param {string} str - Chinese numeral (e.g., "三十五", "一百零五")
   * @returns {number} Arabic numeral (e.g., 35, 105)
   *
   * @example
   * convertSimpleNumber('三十五') // => 35
   * convertSimpleNumber('一百零五') // => 105
   * convertSimpleNumber('三千零二十') // => 3020
   */
  static convertSimpleNumber(str) {
    // Handle numbers with 零 (zero placeholder)
    // Split on the FIRST 零 only; recurse on the remainder to handle multiple 零
    // e.g. "一千零一百零五" → base="一千", remainder="一百零五" → 1000 + 105
    if (str.includes('零')) {
      const firstZeroIndex = str.indexOf('零');
      const basePart = str.slice(0, firstZeroIndex);
      const remainderPart = str.slice(firstZeroIndex + 1);

      let base = this.convertSimpleNumber(basePart) || 0;
      let remainder = remainderPart ? this.convertSimpleNumber(remainderPart) || 0 : 0;

      // For numbers >= 100, handle place value correctly
      // e.g., "一百零五" => base=100, remainder=5 => 105
      if (base >= 100) {
        const magnitude = Math.pow(10, Math.floor(Math.log10(base)));
        return Math.floor(base / magnitude) * magnitude + remainder;
      }
      // For smaller numbers, concatenate
      // e.g., "十零五" => "105" (less common)
      return parseInt(`${base}${remainder}`);
    }

    let total = 0; // Final result
    let section = 0; // Current section (for 万/亿)
    let number = 0; // Current number being built
    let lastNum = 0; // Last digit seen

    // Process character by character
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const value = this.NUMBER_MAP[char];

      if (char === '万' || char === '亿') {
        // Large unit multipliers
        section = section + number + lastNum;
        if (section === 0) section = 1; // Handle lone 万/亿
        total += section * value;
        section = number = lastNum = 0;
      } else if (char === '十') {
        // Handle 十 (ten)
        if (lastNum === 0)
          number += 10; // Lone 十 or leading 十
        else number += lastNum * 10;
        lastNum = 0;
      } else if (char === '百' || char === '千') {
        // Handle 百 (hundred) and 千 (thousand)
        if (lastNum === 0 && char === '百') lastNum = 1; // Handle lone 百
        number += lastNum * value;
        lastNum = 0;
      } else {
        // Regular digit
        lastNum = value;
      }
    }

    return total + section + number + lastNum;
  }

  /**
   * Format a number with thousand separators
   *
   * @param {number} num - Number to format
   * @returns {string} Formatted number (e.g., "1,234,567")
   *
   * @example
   * formatNumber(1234567) // => "1,234,567"
   * formatNumber(123) // => "123"
   */
  static formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Escape special regex characters in a string
   *
   * @param {string} string - String to escape
   * @returns {string} Escaped string safe for use in RegExp
   *
   * @example
   * escapeRegExp('a.b*c') // => "a\\.b\\*c"
   */
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Process percentage patterns (百分之X → X%)
   *
   * @param {string} text - Input text containing Chinese percentages
   * @returns {string} Text with converted percentages
   *
   * @example
   * processPercentages('百分之十五') // => '15%'
   * processPercentages('百分之五十') // => '50%'
   */
  static processPercentages(text) {
    // Handle 百分之[number] pattern (supports decimals like 99.5)
    return text.replace(
      /(百分之)([一二三四五六七八九十百千万亿]+|[\d,\.]+)/g,
      (match, prefix, number) => {
        // If the number is already in Arabic numerals, just extract it
        if (/[\d,\.]+/.test(number)) {
          return `${number.replace(/,/g, '')}%`;
        }

        // Convert Chinese numerals to Arabic
        const value = this.convertSimpleNumber(number);
        return `${value}%`;
      }
    );
  }

  /**
   * Protect compound words and poetic patterns from conversion
   * (Internal preprocessing step)
   *
   * @param {string} text - Input text
   * @returns {string} Text with protected patterns replaced by markers
   */
  static protectCompounds(text) {
    let result = text;

    // First protect percentage expressions
    result = this.processPercentages(result);

    // Then continue with existing compound protection
    this.EXCEPTIONAL_COMPOUNDS.forEach((compound) => {
      if (result.includes(compound)) {
        result = result.replace(
          new RegExp(this.escapeRegExp(compound), 'g'),
          `__COMPOUND_${compound}__`
        );
      }
    });

    // Protect poetic patterns. Markers use the sorted-array index as identifier
    // (not the pattern text itself — Chinese chars inside a marker would be
    // re-matched by subsequent iterations for shorter patterns like 千千/万万).
    // Both protect and restore sort by length descending, so forEach indices agree.
    Object.keys(this.POETIC_TRANSLATIONS)
      .sort((a, b) => b.length - a.length) // Longest first
      .forEach((pattern, index) => {
        if (result.includes(pattern)) {
          const marker = `__POETIC${index}__`;
          result = result.replace(new RegExp(this.escapeRegExp(pattern), 'g'), marker);
        }
      });

    return result;
  }

  /**
   * Process number ranges (三四十 → 30-40, 十五六 → 15-16)
   *
   * @param {string} text - Input text
   * @returns {string} Text with converted number ranges
   *
   * @example
   * processNumberRanges('三四十') // => '30-40'
   * processNumberRanges('十五六') // => '15-16'
   * processNumberRanges('二十五六') // => '25-26'
   */
  static processNumberRanges(text) {
    // First handle the specific case of number+number+十 pattern (e.g. 三四十)
    let result = text.replace(
      /([一二三四五六七八九])([一二三四五六七八九])十(?![一二三四五六七八九])/g,
      (match, firstNum, secondNum, offset, string) => {
        // Don't convert if it's part of a larger number
        const prevChar = offset > 0 ? string[offset - 1] : '';
        if (/[一二三四五六七八九十百千万亿]/.test(prevChar)) {
          return match;
        }

        // Convert to range
        const firstNumber = this.convertSimpleNumber(firstNum + '十'); // e.g., 三十
        const secondNumber = this.convertSimpleNumber(secondNum + '十'); // e.g., 四十

        if (secondNumber > firstNumber) {
          return `${firstNumber}-${secondNumber}`;
        }
        return match;
      }
    );

    // Handle general range patterns (十五六 → 15-16, 二十五六 → 25-26)
    result = result.replace(
      /([十]?[一二三四五六七八九]?十?[一二三四五六七八九]?)([一二三四五六七八九](?!十)|十)(?![一二三四五六七八九])/g,
      (match, firstNum, secondDigit, offset, string) => {
        // Skip if it's part of a larger number or has special context
        const prevChar = offset > 0 ? string[offset - 1] : '';
        const nextChar = string[offset + match.length];

        // Skip if previous character indicates this isn't a range
        if (/[一二三四五六七八九十百千万亿]/.test(prevChar)) {
          return match;
        }

        // Skip if next character indicates this isn't a range
        if (/[一二三四五六七八九十百千万亿]/.test(nextChar)) {
          return match;
        }

        // Check if this is a compound number (like 二十四)
        const isCompoundNumber =
          /^[一二三四五六七八九]?十[一二三四五六七八九]$/.test(match) &&
          !/十[一二三四五六七八九][一二三四五六七八九]$/.test(match);
        if (isCompoundNumber) {
          return match; // Let compound processor handle it
        }

        // Convert the first complete number
        const firstNumber = this.convertSimpleNumber(firstNum);

        // Special handling for teen numbers (十五六 -> 15-16)
        if (firstNum.startsWith('十')) {
          const baseNumber = 10;
          const secondNumber =
            secondDigit === '十' ? 20 : baseNumber + this.convertSimpleNumber(secondDigit);

          if (secondNumber > firstNumber && secondNumber <= firstNumber + 10) {
            return `${firstNumber}-${secondNumber}`;
          }
        }

        // Handle cases like 二三 -> 2-3 (simple digit range)
        const isSimpleRange =
          /^[一二三四五六七八九]$/.test(firstNum) && /^[一二三四五六七八九]$/.test(secondDigit);

        // Handle cases starting with compounds (二十五六 -> 25-26)
        const baseNumber = Math.floor(firstNumber / 10) * 10;
        const secondNumber =
          secondDigit === '十'
            ? baseNumber + 10
            : baseNumber + this.convertSimpleNumber(secondDigit);

        // Check if this is a valid range pattern
        if (
          (isSimpleRange || firstNum.includes('十')) &&
          secondNumber > firstNumber &&
          secondNumber <= firstNumber + 10
        ) {
          return `${firstNumber}-${secondNumber}`;
        }

        // Not a range, leave as is for other processors to handle
        return match;
      }
    );

    return result;
  }

  /**
   * Process compound numbers (三十五 → 35, 一百二十 → 120)
   *
   * @param {string} text - Input text
   * @returns {string} Text with converted compound numbers
   *
   * @example
   * processCompoundNumbers('三十五') // => '35'
   * processCompoundNumbers('一百二十') // => '120'
   */
  static processCompoundNumbers(text) {
    // First, handle complete numbers before 万/亿
    let result = text.replace(
      /([一二三四五六七八九两零]+[千百十]*[一二三四五六七八九两零]*[百十]*[一二三四五六七八九两零]*)[万亿]/g,
      (match, numberPart, _offset, _string) => {
        const unit = match[match.length - 1];
        const value = this.convertSimpleNumber(numberPart);
        return `${value}${unit}`;
      }
    );

    // Then handle other compound numbers
    return result.replace(
      /[一二三四五六七八九两零]+[千百][一二三四五六七八九两零]*[百]*[一二三四五六七八九两零]*[十]*[一二三四五六七八九两零]*|[一二三四五六七八九两零]*[百][一二三四五六七八九两零十]*|[一二三四五六七八九两零]*[十][一二三四五六七八九两零]*/g,
      (match, offset, string) => {
        const nextChar = string[offset + match.length];
        // Special handling for numbers followed by 万 or 亿
        if (nextChar === '万' || nextChar === '亿') return match;

        // Check what comes before the match
        const prevChar = offset > 0 ? string[offset - 1] : '';
        const needsSpace = prevChar && !/[\s，。？！；：""《》、]/.test(prevChar);

        const number = this.formatNumber(this.convertSimpleNumber(match));
        return needsSpace ? ` ${number}` : number;
      }
    );
  }

  /**
   * Process numbers with 两 (two) as a prefix (两百 → 200, 两千 → 2,000)
   *
   * @param {string} text - Input text
   * @returns {string} Text with converted double-unit numbers
   *
   * @example
   * processDoubleUnit('两百') // => '200'
   * processDoubleUnit('两千') // => '2,000'
   * processDoubleUnit('两万') // => '2 vạn'
   */
  static processDoubleUnit(text) {
    return text.replace(/两[百千万亿]/g, (match, offset, string) => {
      const unit = match[match.length - 1];
      const value = 2 * this.NUMBER_MAP[unit];

      if (unit === '万' || unit === '亿') {
        const formattedNumber = this.formatNumber(value / this.NUMBER_MAP[unit]);
        const nextChar = string[offset + match.length];
        // Add extra space if next character is a number
        const needsExtraSpace = nextChar && /[0-9两一二三四五六七八九]/.test(nextChar);
        return `${formattedNumber} ${this.PRESERVED_UNITS[unit]}${needsExtraSpace ? ' ' : ''}`;
      }

      return this.formatNumber(value);
    });
  }

  /**
   * Process large numbers with 万/亿 (X万 → X vạn, X亿Y万 → X ức Y vạn)
   *
   * @param {string} text - Input text
   * @returns {string} Text with converted large numbers
   *
   * @example
   * processLargeNumbers('五万') // => '5 vạn'
   * processLargeNumbers('三亿两万') // => '3 ức 2 vạn'
   */
  static processLargeNumbers(text) {
    // First handle special combinations like 千万
    let result = text.replace(/(千万)(?![一二三四五六七八九十百千万亿])/g, 'ngàn vạn');

    // Handle patterns where numbers might already be converted to Arabic (e.g., "5万", "100亿")
    result = result.replace(/([0-9,]+)\s*([万亿])/g, (match, numberPart, unit) => {
      const value = numberPart.replace(/,/g, ''); // Remove commas
      return `${value} ${this.PRESERVED_UNITS[unit]}`;
    });

    // Then handle the remaining Chinese number patterns
    return result.replace(
      /([一二三四五六七八九十百千]+)亿([一二三四五六七八九十百千]+)万|([一二三四五六七八九十百千]+)[万亿]/g,
      (match, billionPart, millionPart, singlePart) => {
        if (match === '百万') return 'trăm vạn';
        if (match === '千万') return 'ngàn vạn';

        if (billionPart && millionPart) {
          // Case: X亿Y万
          const billionNum = this.convertSimpleNumber(billionPart);
          const millionNum = this.convertSimpleNumber(millionPart);
          return `${billionNum} ${this.PRESERVED_UNITS['亿']} ${this.formatNumber(
            millionNum
          )} ${this.PRESERVED_UNITS['万']}`;
        } else {
          // Case: X万 or X亿
          const unit = match[match.length - 1];
          const value = this.convertSimpleNumber(singlePart || billionPart);
          return `${value} ${this.PRESERVED_UNITS[unit]}`;
        }
      }
    );
  }

  /**
   * Process simple compound numbers (三十五 → 35, 三十 → 30)
   *
   * @param {string} text - Input text
   * @returns {string} Text with converted simple compounds
   *
   * @example
   * processSimpleCompounds('三十五') // => '35'
   * processSimpleCompounds('三十') // => '30'
   * processSimpleCompounds('十') // => '10'
   */
  static processSimpleCompounds(text) {
    // First handle numbers like 三十五 (35)
    let result = text.replace(/[一二三四五六七八九]?十[一二三四五六七八九]/g, (match) =>
      this.convertSimpleNumber(match).toString()
    );

    // Then handle numbers like 三十 (30)
    result = result.replace(/[一二三四五六七八九]十(?![一二三四五六七八九])/g, (match) =>
      this.convertSimpleNumber(match).toString()
    );

    // Handle lone 十 as 10 when appropriate
    result = result.replace(/(?<![一二三四五六七八九])十(?![一二三四五六七八九])/g, '10');

    return result;
  }

  /**
   * Process remaining Chinese numbers that haven't been converted yet
   *
   * @param {string} text - Input text
   * @returns {string} Text with remaining numbers converted
   *
   * @example
   * processRemainingNumbers('第五章') // => '第 5 章'
   */
  static processRemainingNumbers(text) {
    return text.replace(/[一二三四五六七八九十百千万亿零]+/g, (match, offset, string) => {
      // Skip if next character is a numeral in a range pattern
      const nextChar = string[offset + match.length];
      if (nextChar && /[一二三四五六七八九]/.test(nextChar)) {
        const _possibleRange = match + nextChar;
        // Check if it could be a valid range
        const firstNum = this.convertSimpleNumber(match);
        const baseNumber = Math.floor(firstNum / 10) * 10;
        const secondNum = baseNumber + this.convertSimpleNumber(nextChar);
        if (secondNum > firstNum && secondNum <= firstNum + 10) {
          return match;
        }
      }

      // Special case: preserve lone 一 in most contexts
      if (match === '一') return '一';

      // Check if this looks like a proper number structure
      const hasProperNumberStructure =
        /^[二三四五六七八九]/.test(match) ||
        match === '十' ||
        /^十[一二三四五六七八九]/.test(match);

      if (!hasProperNumberStructure) return match;

      const prevChar = offset > 0 ? string[offset - 1] : '';

      // Convert if followed by appropriate context
      if (
        !nextChar ||
        /[\s，。？！；：""《》、]/.test(nextChar) ||
        this.MEASURE_WORDS.has(nextChar) ||
        this.NOUN_INDICATORS.has(nextChar) ||
        /[的是了在与和与或为到]/.test(nextChar)
      ) {
        const needSpaceBefore = prevChar && !/[\s，。？！；：""《》、]/.test(prevChar);
        const prefix = needSpaceBefore ? ' ' : '';
        return `${prefix}${this.convertSimpleNumber(match).toString()}`;
      }
      return match;
    });
  }

  /**
   * Restore protected compound words and poetic patterns
   * (Internal postprocessing step)
   *
   * @param {string} text - Input text with markers
   * @returns {string} Text with original compounds/patterns restored
   */
  static restoreCompounds(text) {
    let result = text;

    // Restore exceptional compounds
    this.EXCEPTIONAL_COMPOUNDS.forEach((compound) => {
      result = result.replace(
        new RegExp(`__COMPOUND_${this.escapeRegExp(compound)}__`, 'g'),
        compound
      );
    });

    // Restore poetic patterns. Sort order must match protectCompounds so that
    // forEach indices map to the same markers.
    Object.entries(this.POETIC_TRANSLATIONS)
      .sort(([a], [b]) => b.length - a.length)
      .forEach(([_pattern, translation], index) => {
        const marker = `__POETIC${index}__`;
        result = result.replace(new RegExp(marker, 'g'), translation);
      });

    return result;
  }

  /**
   * Clean up multiple consecutive spaces
   *
   * @param {string} text - Input text
   * @returns {string} Text with cleaned up spacing
   */
  static cleanupSpaces(text) {
    return text.replace(/ +/g, ' ');
  }

  /**
   * Process all number conversions in text
   *
   * @param {string} text - Input text with Chinese numerals
   * @param {Object} options - Processing options
   * @param {string[]} [options.steps] - Custom processing steps (uses default if not provided)
   * @returns {string} Text with converted numerals
   *
   * @example
   * ChineseNumberConverter.processAll('第五百八十章') // => '第 580 章'
   * ChineseNumberConverter.processAll('百分之十五') // => '15%'
   * ChineseNumberConverter.processAll('三四十人') // => '30-40 人'
   */
  static processAll(text, options = {}) {
    // Default processing order
    const defaultSteps = [
      'protectCompounds',
      'processNumberRanges',
      'processCompoundNumbers',
      'processSimpleCompounds',
      'processDoubleUnit',
      'processLargeNumbers',
      'processRemainingNumbers',
      'restoreCompounds',
      'cleanupSpaces',
    ];

    const steps = options.steps || defaultSteps;
    let result = text;

    for (const step of steps) {
      if (typeof this[step] === 'function') {
        result = this[step](result);
      }
    }

    return result;
  }
}
