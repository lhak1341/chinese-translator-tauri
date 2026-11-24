/**
 * Pure organization of a proper-noun dictionary-id list for the Configuration screen: a 3-way
 * category split (Base / Generic / Fiction), each in display order (`inDisplayOrder`).
 */

import { inDisplayOrder, tierOf } from './DictionaryIdClassifier';

export interface CategorizedDictionaries {
  base: string[];
  generic: string[];
  fiction: string[];
}

export function categorizeDictionaries(dictionaries: string[]): CategorizedDictionaries {
  const base: string[] = [];
  const generic: string[] = [];
  const fiction: string[] = [];

  dictionaries.forEach((id) => {
    const tier = tierOf(id);
    if (tier === 'fiction') fiction.push(id);
    else if (tier === 'generic') generic.push(id);
    else base.push(id); // root + custom: the screen's "Base" group
  });

  return {
    base: inDisplayOrder(base),
    generic: inDisplayOrder(generic),
    fiction: inDisplayOrder(fiction),
  };
}
