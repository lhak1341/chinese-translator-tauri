import { useEffect, useState } from 'react';
import type { EngineAccess, EngineOwner } from '../utils/EngineAccess';
import { logger } from '../utils/logger';

/**
 * Full Translation of one string on the running engine, through the opening surface's
 * `EngineAccess` owner (the Translator's or the Reader's). It sees the dictionaries the engine
 * was last built with, so an entry added since shows only after a rebuild (Cmd/Ctrl-R).
 */
export type TranslatePreview = (text: string) => Promise<string>;

/**
 * A `TranslatePreview` on `access` as `owner`: one `translateWithSegments` call, queued like any
 * other engine call and never preemptible (one short string). It goes through the queue because
 * `translateWithSegments` resets engine-wide segment state (`EngineAccess`). No batch callback,
 * so nothing reaches the surface's streaming state; the panels keep their own result copies.
 */
export function translatePreviewOn(access: EngineAccess, owner: EngineOwner): TranslatePreview {
  return (text) =>
    access
      .run(owner, (engine) => engine.translateWithSegments(text))
      .then((result) => result?.translatedText ?? '');
}

/**
 * The Full Translation of `source`, for the Add form's "Full" line under the gloss: `null`
 * while it is asked, when there is nothing to ask (`translate` or `source` absent), and when
 * the call fails (the engine is not ready, or the call was refused or preempted; logged, never
 * toasted — the line is a reference, not something the user asked for). Asked again when
 * `source` or `translate` changes; an answer for an earlier `source` never lands.
 */
export function useFullTranslationPreview(
  translate: TranslatePreview | undefined,
  source: string | null
): string | null {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!translate || !source) return undefined;
    let current = true;
    translate(source).then(
      (text) => {
        if (current) setPreview(text.trim() || null);
      },
      (error: unknown) => {
        logger.log('Add form: no Full Translation preview:', error);
      }
    );
    return () => {
      current = false;
    };
  }, [translate, source]);

  return preview;
}
