/**
 * Pure organization of a proper-noun dictionary-id list for the Configuration screen:
 * stable sort order, then a 3-way category split (Base / Generic / Fiction).
 */

export function sortDictionaries(dictionaries: string[]): string[] {
  return dictionaries.sort((a, b) => {
    if (a === 'properNouns') return -1;
    if (b === 'properNouns') return 1;
    return a.localeCompare(b);
  });
}

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
    const name = id.replace('properNouns-', '');
    if (id === 'properNouns') {
      base.push(id);
    } else if (name.startsWith('f_')) {
      fiction.push(id);
    } else if (name.startsWith('_')) {
      generic.push(id);
    } else {
      base.push(id);
    }
  });

  return {
    base: base.sort((a, b) => a.localeCompare(b)),
    generic: generic.sort((a, b) => a.localeCompare(b)),
    fiction: fiction.sort((a, b) => a.localeCompare(b)),
  };
}
