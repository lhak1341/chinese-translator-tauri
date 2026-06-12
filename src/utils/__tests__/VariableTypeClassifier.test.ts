import { describe, it, expect } from 'vitest';
import { classifyVariableType } from '../pattern/VariableTypeClassifier.js';

describe('classifyVariableType', () => {
  describe('metadata.semanticType takes priority', () => {
    it('returns explicit semanticType for properNoun source', () => {
      expect(
        classifyVariableType('properNouns_pattern_variable', '北京', { semanticType: 'location' })
      ).toBe('location');
    });

    it('returns explicit semanticType even for fiction dict source', () => {
      expect(
        classifyVariableType('properNouns-f_HarryPotter_pattern_variable', '哈利', {
          semanticType: 'character',
        })
      ).toBe('character');
    });

    it('returns explicit semanticType for all canonical types', () => {
      const types = ['character', 'location', 'organization', 'concept', 'object'] as const;
      for (const t of types) {
        expect(
          classifyVariableType('properNouns_pattern_variable', '词', { semanticType: t })
        ).toBe(t);
      }
    });
  });

  describe('properNoun source without metadata', () => {
    it('returns location for word with place indicator 市', () => {
      expect(classifyVariableType('properNouns_pattern_variable', '上海市')).toBe('location');
    });

    it('returns location for word ending with 京', () => {
      expect(classifyVariableType('properNouns-_EU-America_pattern_variable', '北京')).toBe(
        'location'
      );
    });

    it('returns character for word matching surname pattern', () => {
      expect(classifyVariableType('properNouns_pattern_variable', '李白')).toBe('character');
    });

    it('returns proper_noun fallback when heuristic returns unknown', () => {
      expect(classifyVariableType('properNouns_pattern_variable', '奥术')).toBe('concept');
    });

    it('returns proper_noun when word is empty', () => {
      expect(classifyVariableType('properNouns_pattern_variable', '')).toBe('proper_noun');
    });

    it('returns proper_noun when no word provided', () => {
      expect(classifyVariableType('properNouns_pattern_variable')).toBe('proper_noun');
    });

    it('fiction dict without metadata falls through to heuristic, not hardcoded character', () => {
      // properNouns-f_* entries without semanticType run heuristic, not the deleted hardcode
      const result = classifyVariableType('properNouns-f_HarryPotter_pattern_variable', '霍格沃茨');
      // 霍格沃茨 has no place/surname/concept indicator → proper_noun
      expect(result).toBe('proper_noun');
    });

    it('fiction dict with location word returns location via heuristic', () => {
      expect(classifyVariableType('properNouns-f_LordOfTheRings_pattern_variable', '魔多省')).toBe(
        'location'
      );
    });

    it('DuongThan entries without metadata fall through to heuristic (hardcode deleted)', () => {
      // Previously hardcoded to 'character' — now uses heuristic
      // '随机词' has no place/surname/concept indicator → heuristic unknown → proper_noun
      const result = classifyVariableType('properNouns-f_DuongThan_pattern_variable', '随机词');
      expect(result).toBe('proper_noun');
    });
  });

  describe('phrase source', () => {
    it('returns concept for phrase source', () => {
      expect(classifyVariableType('phrases_pattern_variable', '某词')).toBe('concept');
    });

    it('returns concept regardless of word', () => {
      expect(classifyVariableType('phrases_pattern_variable', '上海市')).toBe('concept');
    });
  });

  describe('character source', () => {
    it('returns character_unit for character source', () => {
      expect(classifyVariableType('characters_pattern_variable', '的')).toBe('character_unit');
    });
  });

  describe('no special source', () => {
    it('returns heuristic result for plain word with no source', () => {
      expect(classifyVariableType(undefined, '北京市')).toBe('location');
    });

    it('returns unknown when no source and no word', () => {
      expect(classifyVariableType(undefined)).toBe('unknown');
    });

    it('returns unknown for unrecognized word with no source', () => {
      expect(classifyVariableType(undefined, '阿巴巴')).toBe('unknown');
    });
  });

  describe('heuristic place indicators', () => {
    const placeSuffixes: [string, string][] = [
      ['上海市', '市'],
      ['广东省', '省'],
      ['中国', '国'],
      ['某县', '县'],
      ['某区', '区'],
      ['某镇', '镇'],
      ['某村', '村'],
      ['某州', '州'],
      ['某府', '府'],
      ['南京', '京-suffix'],
      ['上海', '海-suffix'],
      ['四川', '川-suffix'],
    ];

    for (const [word, indicator] of placeSuffixes) {
      it(`returns location for word with ${indicator}`, () => {
        expect(classifyVariableType('properNouns_pattern_variable', word)).toBe('location');
      });
    }
  });

  describe('heuristic concept indicators', () => {
    it('returns concept for word containing 法', () => {
      expect(classifyVariableType(undefined, '魔法')).toBe('concept');
    });

    it('returns concept for word containing 术', () => {
      expect(classifyVariableType(undefined, '仙术')).toBe('concept');
    });

    it('returns concept for word containing 道', () => {
      expect(classifyVariableType(undefined, '天道')).toBe('concept');
    });
  });
});
