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
 * - characterOnlyUnitIndex: Currently highlighted unit in character-only mode (-1 = none)
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
 * @property {number} characterOnlyUnitIndex - Currently highlighted unit in character-only mode (-1 = none)
 * @property {boolean} isCharacterOnlyClick - Whether highlight originated from character-only click
 */

/**
 * @typedef {Object} HighlightingAction
 * @property {'HIGHLIGHT_ORIGINAL'|'HIGHLIGHT_TRANSLATION'|'HIGHLIGHT_FROM_CHARACTER_ONLY'|'HIGHLIGHT_BOTH'|'SET_CHARACTER_ONLY_INDEX'|'CLEAR_ALL'} type
 * @property {number} [unitIndex] - Unit index for highlighting actions
 */

/**
 * Highlighting state reducer
 * @param {HighlightingState} state - Current state
 * @param {HighlightingAction} action - Action to perform
 * @returns {HighlightingState} New state
 */
export function highlightingReducer(state, action) {
  switch (action.type) {
    case 'HIGHLIGHT_ORIGINAL':
      // User clicked on original text segment
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: -1,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false
      };

    case 'HIGHLIGHT_TRANSLATION':
      // User clicked on translation text segment
      return {
        unitIndex: -1,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false
      };

    case 'HIGHLIGHT_FROM_CHARACTER_ONLY':
      // User clicked on character-only translation - highlight both original and main translation
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: true
      };

    case 'HIGHLIGHT_BOTH':
      // Highlight same unit in both original and translation (e.g., search result)
      return {
        unitIndex: action.unitIndex,
        translationUnitIndex: action.unitIndex,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false
      };

    case 'SET_CHARACTER_ONLY_INDEX':
      // Set only the character-only index (for bridge useEffect)
      return {
        ...state,
        characterOnlyUnitIndex: action.unitIndex
      };

    case 'CLEAR_ALL':
      // Clear all highlighting
      return {
        unitIndex: -1,
        translationUnitIndex: -1,
        characterOnlyUnitIndex: -1,
        isCharacterOnlyClick: false
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
  isCharacterOnlyClick: false
};
