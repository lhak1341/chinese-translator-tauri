/**
 * Unified Chinese Number Conversion System
 * Centralizes all number conversion logic with systematic pattern matching
 * Replaces ~90 lines of scattered number conversion with unified approach
 */

export class NumberProcessor {
  constructor() {
    // Single centralized number mapping (eliminates 5 duplicates)
    this.NUMBER_MAP = {
      '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '零': 0
    };
    
    // Unified conversion patterns (ordered by precedence: longest first)
    this.CONVERSION_PATTERNS = [
      {
        name: 'fourDigitYear',
        regex: /([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])([一二两三四五六七八九零])年/,
        converter: this.convertFourDigitYear.bind(this),
        description: 'Four-digit years like 一九四五年 (năm 1945), 二零二四年 (năm 2024)'
      },
      {
        name: 'thousandTenThousand',
        regex: /([一二两三四五六七八九])千万/,
        converter: this.convertThousandTenThousand.bind(this),
        description: 'Large numbers like 五千万 (50 million)'
      },
      {
        name: 'thousands',
        regex: /([一二两三四五六七八九])千(零[一二两三四五六七八九]十[一二三四五六七八九]?|零十[一二三四五六七八九]|零十|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百零[一二三四五六七八九]|[一二两三四五六七八九]百|[一二两三四五六七八九]十[一二三四五六七八九]?|十[一二三四五六七八九]|十|[一二三四五六七八九])?/,
        converter: this.convertThousands.bind(this),
        description: 'Thousands like 三千 (3000), 三千七百 (3700), 三千十五 (3,015). Handles implicit tens patterns.'
      },
      {
        name: 'percentageRange',
        regex: /百分之([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: this.convertPercentageRange.bind(this),
        description: 'Percentage ranges like 百分之五六十 (50-60%)'
      },
      {
        name: 'percentage',
        regex: /百分之([一二两三四五六七八九]千[一二两三四五六七八九]?百?[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二三四五六七八九]?|[一二两三四五六七八九]十[一二两三四五六七八九]|[一二两三四五六七八九]十|十[一二两三四五六七八九]|十|[一二两三四五六七八九]|\d+)/,
        converter: this.convertPercentage.bind(this),
        description: 'Percentages like 百分之三十 (30%), 百分之十五 (15%), 百分之两百 (200%)'
      },
      {
        name: 'tenThousandRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])万/,
        converter: this.convertTenThousandRange.bind(this),
        description: 'Ten thousand ranges like 七八万 (7-8 vạn)'
      },
      {
        name: 'thousandRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])千/,
        converter: this.convertThousandRange.bind(this),
        description: 'Thousand ranges like 七八千 (7-8 ngàn)'
      },
      {
        name: 'hundredsRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])百/,
        converter: this.convertHundredsRange.bind(this),
        description: 'Hundreds ranges like 四五百 (400-500)'
      },
      {
        name: 'hundredsPlusTensRange',
        regex: /([一二两三四五六七八九])百([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: this.convertHundredsPlusTensRange.bind(this),
        description: 'Hundreds plus tens ranges like 一百五六十 (150-160), 两百七八十 (270-280)'
      },
      {
        name: 'numberRange',
        regex: /([一二两三四五六七八九])([一二两三四五六七八九])十/,
        converter: this.convertNumberRange.bind(this),
        description: 'Number ranges like 五六十 (50-60), 七八十 (70-80) - validates logical ranges'
      },
      {
        name: 'teenAgeRange',
        regex: /十([一二两三四五六七八九])([一二两三四五六七八九])/,
        converter: this.convertTeenAgeRange.bind(this),
        description: 'Teen age ranges like 十六七 (16-17), 十二三 (12-13)'
      },
      {
        name: 'tensBasedRange',
        regex: /([二三四五六七八九])十([一二两三四五六七八九])([一二两三四五六七八九])/,
        converter: this.convertTensBasedRange.bind(this),
        description: 'Tens-based age ranges like 二十八九 (28-29), 三十四五 (34-35)'
      },
      {
        name: 'hundredsWithZero',
        regex: /([一二两三四五六七八九])百零([一二两三四五六七八九])/,
        converter: this.convertHundredsWithZero.bind(this),
        description: 'Hundreds with zero like 两百零六 (206), 三百零五 (305)'
      },
      {
        name: 'hundreds',
        regex: /([一二两三四五六七八九])百([一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九]十|十[一二两三四五六七八九]|[一二三四五六七八九])?/,
        converter: this.convertHundreds.bind(this),
        description: 'Hundreds like 一百 (100), 三百五十 (350), 两百七十一 (271). Excludes 两 at final position.'
      },
      {
        name: 'tensPlusUnits',
        regex: /([一二两三四五六七八九])十([一二三四五六七八九])?/,
        converter: this.convertTensPlusUnits.bind(this),
        description: 'Two-digit numbers like 三十 (30), 二十五 (25). Excludes 两 at final position to prevent unit confusion.'
      },
      {
        name: 'implicitTens',
        regex: /十([一二两三四五六七八九])/,
        converter: this.convertImplicitTens.bind(this),
        description: 'Numbers like 十七 (17), 十五 (15) where tens digit is implicit'
      },
      {
        name: 'standalone_ten',
        regex: /十/,
        converter: () => null, // Skip standalone 十 to allow phrase processing
        description: 'Skip 十 alone to allow phrases like 十字架'
      }
    ];
  }

  /**
   * Process number conversion for tokens using unified pattern matching
   * @param {Token[]} tokens - Array of tokens to process
   * @param {Object} options - Processing options
   */
  processTokens(tokens, options = {}) {
    const TokenType = { CHINESE_CHAR: 'chinese_char' }; // Import from TokenType if available
    
    const debugLevel = options.debugLevel || 0;
    const log = (level, message, data = null) => {
      if (process.env.NODE_ENV === 'development' && debugLevel >= level) {
        console.log(message, data || '');
      }
    };
    
    log(2, '🔢 Starting unified Chinese number conversion');
    
    // Filter untranslated Chinese characters for processing
    const untranslatedChars = tokens
      .filter(t => t.type === TokenType.CHINESE_CHAR && t.translated === null && !t.translationSource)
      .map(t => t.value);
    
    log(3, '🔢 Available untranslated Chinese characters:', untranslatedChars);
    
    // Process each token position for number patterns
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== TokenType.CHINESE_CHAR || tokens[i].translated !== null || tokens[i].translationSource) {
        continue;
      }
      
      // Try to match number patterns starting from this position
      const matchResult = this.findLongestNumberMatch(tokens, i, { log, debugLevel });
      
      if (matchResult) {
        log(2, `🔢 Number converted: "${matchResult.originalText}" -> "${matchResult.result}" (${matchResult.patternName})`);
        
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
   * @param {Object} options - Options including log function
   * @returns {Object|null} Match result or null
   */
  findLongestNumberMatch(tokens, startIndex, options = {}) {
    const { log = () => {}, _debugLevel = 0 } = options;
    
    let longestMatch = null;
    let longestMatchLength = 0;
    
    // Build test sequences of increasing length (max 8 tokens to handle complex numbers like 七千七百七十七)
    for (let endIndex = startIndex; endIndex < tokens.length && endIndex <= startIndex + 7; endIndex++) {
      const token = tokens[endIndex];
      
      // Only consider Chinese characters
      if (token.type !== 'chinese_char' || token.translated !== null || token.translationSource) {
        break;
      }
      
      // Build test sequence from startIndex to endIndex
      const testSequence = tokens
        .slice(startIndex, endIndex + 1)
        .map(t => t.value)
        .join('');
      
      // Test against all patterns
      for (const pattern of this.CONVERSION_PATTERNS) {
        const match = testSequence.match(new RegExp('^' + pattern.regex.source + '$'));
        
        log(3, `🔍 Testing sequence "${testSequence}" against ${pattern.name}: ${match ? 'MATCH' : 'no match'}`);
        
        if (match && testSequence.length > longestMatchLength) {
          // Found a longer match
          const result = pattern.converter(...match);
          
          // Skip if converter returned null (indicating invalid match)
          if (result === null) {
            continue;
          }
          
          longestMatch = {
            originalText: testSequence,
            result: result,
            patternName: pattern.name,
            startIndex: startIndex,
            endIndex: endIndex,
            matchData: match
          };
          longestMatchLength = testSequence.length;
        }
      }
    }
    
    return longestMatch;
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
      tokens[i].translationSource = 'number_conversion_consumed';
    }
    
    // Add to semantic array builder if provided
    if (options.semanticArrayBuilder) {
      // Calculate global position accounting for chunk offset
      const globalTokenIndex = startIndex + (options.chunkOffset || 0);
      options.semanticArrayBuilder.addUnit(
        matchResult.originalText,
        matchResult.result,
        'numbers',
        globalTokenIndex
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
   * Convert hundreds with unified remainder handling (e.g., 三百五十 -> 350)
   */
  convertHundreds(match, hundreds, remainder) {
    const hundredsValue = this.NUMBER_MAP[hundreds] * 100;
    const remainderValue = remainder ? this.parseChineseNumber(remainder) : 0;
    return (hundredsValue + remainderValue).toString();
  }

  /**
   * Convert ten thousand ranges (e.g., 七八万 -> 7-8 vạn)
   * Only converts if the digits form a logical consecutive range
   */
  convertTenThousandRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    
    // Only allow consecutive digits or logical ranges (difference of 1 or ascending order)
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      // Return null to indicate this pattern should not match
      return null;
    }
    
    return `${firstValue}-${secondValue} vạn`;
  }

  /**
   * Convert thousand ranges (e.g., 七八千 -> 7-8 ngàn)
   * Only converts if the digits form a logical consecutive range
   */
  convertThousandRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    
    // Only allow consecutive digits or logical ranges (difference of 1 or ascending order)
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      // Return null to indicate this pattern should not match
      return null;
    }
    
    return `${firstValue}-${secondValue} ngàn`;
  }

  /**
   * Convert hundreds ranges (e.g., 四五百 -> 400-500)
   * Only converts if the digits form a logical consecutive range
   */
  convertHundredsRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];
    
    // Only allow consecutive digits or logical ranges (difference of 1 or ascending order)
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      // Return null to indicate this pattern should not match
      return null;
    }
    
    const firstHundreds = firstValue * 100;
    const secondHundreds = secondValue * 100;
    return `${firstHundreds}-${secondHundreds}`;
  }

  /**
   * Convert hundreds plus tens range (e.g., 一百五六十 -> 150-160)
   * Only converts if the digits form a logical consecutive range
   */
  convertHundredsPlusTensRange(match, hundreds, firstDigit, secondDigit) {
    const hundredsValue = this.NUMBER_MAP[hundreds] * 100;
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];

    // Only allow consecutive digits or logical ranges (difference of 1 or ascending order)
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      return null;
    }

    const firstTotal = hundredsValue + (firstValue * 10);
    const secondTotal = hundredsValue + (secondValue * 10);
    return `${firstTotal}-${secondTotal}`;
  }

  /**
   * Convert number ranges (e.g., 五六十 -> 50-60)
   * Only converts if the digits form a logical consecutive range
   */
  convertNumberRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];

    // Only allow consecutive digits or logical ranges (difference of 1 or ascending order)
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      // Return null to indicate this pattern should not match
      return null;
    }

    const firstTens = firstValue * 10;
    const secondTens = secondValue * 10;
    return `${firstTens}-${secondTens}`;
  }

  /**
   * Convert teen age ranges (e.g., 十六七 -> 16-17)
   */
  convertTeenAgeRange(match, firstUnits, secondUnits) {
    const firstValue = 10 + this.NUMBER_MAP[firstUnits];
    const secondValue = 10 + this.NUMBER_MAP[secondUnits];
    
    // Validate that it's a logical consecutive range
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      return null;
    }
    
    return `${firstValue}-${secondValue}`;
  }

  /**
   * Convert tens-based age ranges (e.g., 二十八九 -> 28-29)
   */
  convertTensBasedRange(match, tens, firstUnits, secondUnits) {
    const tensValue = this.NUMBER_MAP[tens] * 10;
    const firstValue = tensValue + this.NUMBER_MAP[firstUnits];
    const secondValue = tensValue + this.NUMBER_MAP[secondUnits];
    return `${firstValue}-${secondValue}`;
  }

  /**
   * Convert thousands (e.g., 三千七百 -> 3700, 二千五百三十 -> 2530)
   * Excludes patterns ending with 两 (e.g., 三千两, 一千零两)
   */
  convertThousands(match, thousands, remainder) {
    const thousandsValue = this.NUMBER_MAP[thousands] * 1000;
    const remainderValue = remainder ? this.parseChineseNumber(remainder) : 0;
    return (thousandsValue + remainderValue).toLocaleString();
  }

  /**
   * Convert large numbers (e.g., 一千万 -> 10,000,000, 五千万 -> 50,000,000)
   */
  convertThousandTenThousand(match, digit) {
    const thousands = this.NUMBER_MAP[digit] * 1000;
    const tenThousands = thousands * 10000; // 千万 = thousands × 10,000
    return tenThousands.toLocaleString();
  }

  /**
   * Convert percentage ranges (e.g., 百分之五六十 -> 50-60%)
   */
  convertPercentageRange(match, firstDigit, secondDigit) {
    const firstValue = this.NUMBER_MAP[firstDigit];
    const secondValue = this.NUMBER_MAP[secondDigit];

    // Validate that it's a logical consecutive range
    if (secondValue !== firstValue + 1 && secondValue <= firstValue) {
      return null;
    }

    return `${firstValue * 10}-${secondValue * 10}%`;
  }

  /**
   * Convert percentages with unified number parsing (e.g., 百分之三十 -> 30%)
   */
  convertPercentage(match, number) {
    // Extract the number part after "百分之"
    const after_prefix = match.replace('百分之', '');
    let value = 0;

    // Handle already converted numbers (digits)
    if (/^\d+$/.test(after_prefix)) {
      value = parseInt(after_prefix);
    } else {
      // Parse Chinese number
      value = this.parseChineseNumber(after_prefix);
    }

    return `${value}%`;
  }

  /**
   * Unified Chinese number parsing (eliminates duplicate logic)
   * @param {string} chineseNumber - Chinese number string
   * @returns {number} Parsed numeric value
   */
  parseChineseNumber(chineseNumber) {
    if (!chineseNumber) return 0;
    
    // Handle thousands patterns like 一千两百 (1200), 三千五百 (3500), 一千零二十四 (1024)
    if (chineseNumber.includes('千')) {
      const thousandsMatch = chineseNumber.match(/([一二两三四五六七八九])千(零[一二两三四五六七八九]十[一二三四五六七八九]?|[一二两三四五六七八九]百[一二两三四五六七八九]?十?[一二两三四五六七八九]?|[一二两三四五六七八九]百零[一二两三四五六七八九]|[一二两三四五六七八九]百|[一二两三四五六七八九]十[一二三四五六七八九]?|[一二三四五六七八九])?/);
      if (thousandsMatch) {
        const thousandsValue = this.NUMBER_MAP[thousandsMatch[1]] * 1000;
        const remainderValue = thousandsMatch[2] ? this.parseChineseNumber(thousandsMatch[2]) : 0;
        return thousandsValue + remainderValue;
      }
    }
    
    // Handle hundreds patterns like 七百 (700), 三百五十 (350), 两百零六 (206)
    if (chineseNumber.includes('百')) {
      // Check for hundreds with zero first (longer pattern)
      const hundredsZeroMatch = chineseNumber.match(/([一二两三四五六七八九])百零([一二两三四五六七八九])/);
      if (hundredsZeroMatch) {
        const hundredsValue = this.NUMBER_MAP[hundredsZeroMatch[1]] * 100;
        const unitsValue = this.NUMBER_MAP[hundredsZeroMatch[2]];
        return hundredsValue + unitsValue;
      }
      
      // Check for regular hundreds (exclude 两 at final position)
      const hundredsMatch = chineseNumber.match(/([一二两三四五六七八九])百([一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九]十|[一二三四五六七八九])?/);
      if (hundredsMatch) {
        const hundredsValue = this.NUMBER_MAP[hundredsMatch[1]] * 100;
        const remainderValue = hundredsMatch[2] ? this.parseChineseNumber(hundredsMatch[2]) : 0;
        return hundredsValue + remainderValue;
      }
    }
    
    // Handle zero + tens patterns like 零二十四 (24) first (longest pattern)
    if (chineseNumber.includes('零') && chineseNumber.includes('十')) {
      const zeroTensMatch = chineseNumber.match(/^零([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
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
    
    // Handle single digit
    return this.NUMBER_MAP[chineseNumber] || 0;
  }

  /**
   * Get debug information about number conversion patterns
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      availablePatterns: this.CONVERSION_PATTERNS.map(p => ({
        name: p.name,
        regex: p.regex.source,
        description: p.description
      })),
      numberMap: this.NUMBER_MAP,
      patternCount: this.CONVERSION_PATTERNS.length
    };
  }


  /**
   * Test number conversion with sample inputs
   * @param {string} testInput - Chinese number to test
   * @returns {Object} Test result
   */
  testConversion(testInput) {
    const mockTokens = testInput.split('').map(char => ({
      type: 'chinese_char',
      value: char,
      translated: null,
      translationSource: null
    }));
    
    const matchResult = this.findLongestNumberMatch(mockTokens, 0, { debugLevel: 3 });
    
    return {
      input: testInput,
      match: matchResult,
      result: matchResult ? matchResult.result : null,
      pattern: matchResult ? matchResult.patternName : null
    };
  }
}