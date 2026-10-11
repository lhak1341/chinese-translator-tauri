import { useState, useCallback } from 'react';

/**
 * Owns the 5 translation output fields and exposes named operations so every
 * write decides all relevant fields atomically. No raw setters escape this hook.
 *
 * Operations:
 *   setStreamingText(text)             — text-only update during progressive path; arrays stay as-is
 *   setFullResult(text, arrays, segs?) — text + arrays + prebuiltSegments (atomic)
 *   setResultArrays(arrays, segs?)     — arrays only, after text already set by progress handler
 *   setDualResults(full, charOnly)     — all 5 fields; full/charOnly are { translatedText, semanticArrays }
 *   setCharOnlyResult(text, arrays)    — charOnly fields only
 *   setStatusMessage(msg)              — status/progress text; clears all arrays
 *   setError(msg)                      — error text; clears all arrays
 *   reset()                            — all fields → initial state
 */
export function useTranslationResults() {
  const [translatedText, setTranslatedText] = useState('');
  const [characterOnlyText, setCharacterOnlyText] = useState('');
  const [semanticArrays, setSemanticArrays] = useState(null);
  const [characterOnlySemanticArrays, setCharacterOnlySemanticArrays] = useState(null);
  const [prebuiltSegments, setPrebuiltSegments] = useState([]);

  const setStreamingText = useCallback((text) => {
    setTranslatedText(text);
  }, []);

  const setFullResult = useCallback((text, arrays, segs = null) => {
    setTranslatedText(text);
    setSemanticArrays(arrays);
    if (segs !== null) setPrebuiltSegments(segs);
  }, []);

  const setResultArrays = useCallback((arrays, segs = []) => {
    setSemanticArrays(arrays);
    setPrebuiltSegments(segs);
  }, []);

  const setDualResults = useCallback((full, charOnly) => {
    setTranslatedText(full.translatedText);
    setSemanticArrays(full.semanticArrays);
    setCharacterOnlyText(charOnly.translatedText);
    setCharacterOnlySemanticArrays(charOnly.semanticArrays);
  }, []);

  const setCharOnlyResult = useCallback((text, arrays) => {
    setCharacterOnlyText(text);
    setCharacterOnlySemanticArrays(arrays);
  }, []);

  const clearArraysAndSetText = (text) => {
    setTranslatedText(text);
    setSemanticArrays(null);
    setCharacterOnlySemanticArrays(null);
    setCharacterOnlyText('');
    setPrebuiltSegments([]);
  };

  const setStatusMessage = useCallback((msg) => {
    clearArraysAndSetText(msg);
  }, []);

  const setError = useCallback((msg) => {
    clearArraysAndSetText(msg);
  }, []);

  const reset = useCallback(() => {
    setTranslatedText('');
    setCharacterOnlyText('');
    setSemanticArrays(null);
    setCharacterOnlySemanticArrays(null);
    setPrebuiltSegments([]);
  }, []);

  return {
    translatedText,
    characterOnlyText,
    semanticArrays,
    characterOnlySemanticArrays,
    prebuiltSegments,
    setStreamingText,
    setFullResult,
    setResultArrays,
    setDualResults,
    setCharOnlyResult,
    setStatusMessage,
    setError,
    reset,
  };
}
