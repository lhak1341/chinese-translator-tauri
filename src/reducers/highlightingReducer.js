import { logger } from '../utils/logger';

/**
 * Highlighting State Reducer
 *
 * Manages all highlighting-related state atomically for the Translator component.
 * Replaces 4 separate useState calls with a single useReducer for better performance
 * and atomic state updates.
 *
 * State Shape:
 * - unitIndex: Currently highlighted unit in original text (-1 = none)
 * - translationUnitIndex: Currently highlighted unit in translation (-1 = none)
 * - characterOnlyUnitIndex: Currently highlighted unit(s) in character-only mode (-1 = none, array for multi-word segments)
 * - isCharacterOnlyClick: Whether highlight originated from character-only click
 *
 * Actions:
 * - HIGHLIGHT_ORIGINAL: User clicked original text segment
 * - HIGHLIGHT_TRANSLATION: User clicked translation segment
 * - HIGHLIGHT_FROM_CHARACTER_ONLY: User clicked character-only translation
 * - HIGHLIGHT_BOTH: Highlight same unit in both texts (e.g., search result)
 * - SET_CHARACTER_ONLY_INDEX: Update only character-only index (for bridge useEffect)
 * - CLEAR_ALL: Clear all highlighting
 *
 * Benefits:
 * - Atomic updates: All highlighting state changes in single render
 * - Reduced re-renders: One reducer vs 4 useState calls
 * - Type safety: Action types prevent invalid state transitions
 * - Testable: Pure function, easy to unit test
 *
 * @example
 * const [highlightingState, dispatch] = useReducer(highlightingReducer, {
 *   unitIndex: -1,
 *   translationUnitIndex: -1,
 *   characterOnlyUnitIndex: -1,
 *   isCharacterOnlyClick: false
 * });
 *
 * // Highlight original text segment
 * dispatch({ type: 'HIGHLIGHT_ORIGINAL', unitIndex: 5 });
 */

/**
 * @typedef {Object} HighlightingState
 * @property {number} unitIndex - Currently highlighted unit in original text (-1 = none)
 * @property {number} translationUnitIndex - Currently highlighted unit in translation (-1 = none)
 * @property {number|number[]} characterOnlyUnitIndex - Currently highlighted unit(s) in character-only mode (-1 = none, array for multi-word segments)
 * @property {boolean} isCharacterOnlyClick - Whether highlight originated from character-only click
 */

/**
 * @typedef {Object} HighlightingAction
 * @property {'HIGHLIGHT_ORIGINAL'|'HIGHLIGHT_TRANSLATION'|'HIGHLIGHT_FROM_CHARACTER_ONLY'|'HIGHLIGHT_BOTH'|'SET_CHARACTER_ONLY_INDEX'|'CLEAR_ALL'} type
 * @property {number} [unitIndex] - Unit index for highlighting actions
 */

/**
 * MEDIUM-3 FIX: Validate unit index before updating state
 * CRITICAL-1 REVERT: Accept arrays for SET_CHARACTER_ONLY_INDEX and keep them as arrays (multi-word segments need arrays)
 * @param {number|number[]} unitIndex - Unit index to validate (can be array for Character-only multi-word segments)
 * @param {string} actionType - Action type (affects validation rules)
 * @returns {boolean} True if index is valid
 */
function isValidUnitIndex(unitIndex, actionType) {
  // SET_CHARACTER_ONLY_INDEX accepts arrays for multi-word segments (e.g., "ha lợi ba đặc" = [0,1,2,3])
  // Arrays are kept as-is, not normalized - ClickableTranslationSemantic expects arrays
  if (actionType === 'SET_CHARACTER_ONLY_INDEX') {
    if (Array.isArray(unitIndex)) {
      // Array of indices: all must be numbers >= 0, array must not be empty
      return unitIndex.length > 0 && unitIndex.every((idx) => typeof idx === 'number' && idx >= 0);
    }
    // Single index: must be number >= -1
    return typeof unitIndex === 'number' && unitIndex >= -1;
  }

  // All other actions: must be single number >= -1
  return typeof unitIndex === 'number' && unitIndex >= -1;
}

/**
 * MEDIUM-2 FIX: Define required properties for each action type
 * Validates action structure before processing to prevent state corruption
 */
const REQUIRED_PROPERTIES = {
  HIGHLIGHT_ORIGINAL: ['unitIndex'],
  HIGHLIGHT_TRANSLATION: ['unitIndex'],
  HIGHLIGHT_FROM_CHARACTER_ONLY: ['unitIndex'],
  HIGHLIGHT_BOTH: ['unitIndex'],
  SET_CHARACTER_ONLY_INDEX: ['unitIndex'],
  CLEAR_ALL: [], // No required properties
};

/**
 * Highlighting state reducer
 * @param {HighlightingState} state - Current state
 * @param {HighlightingAction} action - Action to perform
 * @returns {HighlightingState} New state
 */
export function highlightingReducer(state, action) {
  // MEDIUM-2 FIX: Validate action structure based on type
  const required = REQUIRED_PROPERTIES[action.type] || [];
  for (const prop of required) {
    if (!(prop in action)) {
      logger.warn(`Invalid action ${action.type}: missing required property "${prop}"`);
      return state;
    }
  }

  // MEDIUM-3 FIX: Validate indices in all actions (action-specific validation)
  if (action.unitIndex !== undefined && !isValidUnitIndex(action.unitIndex, action.type)) {
    logger.warn(`Invalid unitIndex in ${action.type}:`, action.unitIndex, '- ignoring action');
    return state; // Don't update state with invalid index
  }

  switch (action.type) {
    case 'HIGHLIGHT_ORIGINAL':
      // User clicked on original text segment
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: -1,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false,
      };

    case 'HIGHLIGHT_TRANSLATION':
      // User clicked on translation text segment
      return {
        unitIndex: -1,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false,
      };

    case 'HIGHLIGHT_FROM_CHARACTER_ONLY':
      // User clicked on character-only translation - highlight both original and main translation
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: true,
      };

    case 'HIGHLIGHT_BOTH':
      // Highlight same unit in both original and translation (e.g., search result)
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false,
      };

    case 'SET_CHARACTER_ONLY_INDEX':
      // Set only the character-only index (for bridge useEffect)
      // CRITICAL-1 REVERT: Keep arrays for multi-word segments (ClickableTranslationSemantic expects arrays)
      // Character-only translation needs arrays to highlight multi-word segments like "ha lợi ba đặc"
      // Example: "Harry Potter" → "哈利波特" (single word) → "ha lợi ba đặc" (4 words, indices [0,1,2,3])
      return {
        ...state,
        characterOnlyUnitIndex: action.unitIndex, // Keep as-is (array or single)
      };

    case 'CLEAR_ALL':
      // Clear all highlighting
      return {
        unitIndex: -1,
        translationUnitIndex: -1,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false,
      };

    default:
      return state;
  }
}

/**
 * Initial highlighting state
 * Use with useReducer: useReducer(highlightingReducer, INITIAL_HIGHLIGHTING_STATE)
 */
export const INITIAL_HIGHLIGHTING_STATE = {
  unitIndex: -1,
  translationUnitIndex: -1,
  characterOnlyUnitIndex: -1,
  isCharacterOnlyClick: false,
};
