/**
 * Builds the onProgress payload for translateWithProgressiveBatches (architecture
 * review 2026-07-29, candidate #1). Pure function of its inputs — no `this`, no
 * engine state. Owns: the debounce gate (time-since-last-update + every-3rd-batch +
 * last-batch-always), metadata gap-filling with a shared frozen default object, and
 * the deep-clone of semantic arrays.
 *
 * The deep-clone is load-bearing, not decorative: React state updates receive direct
 * references, and the next batch continues mutating the same arrays after React has
 * already scheduled a render from them — without cloning here, the semantic-array
 * consumer can crash on an array-size mismatch against the text length it was
 * rendered against (see the CRITICAL FIX comment this was extracted from).
 *
 * @typedef {{ source: string, phase: string|null, dictionary: string|null, isMissing: boolean }} DefaultMetadataEntry
 */

const DEFAULT_METADATA = Object.freeze({
  source: 'progressive',
  phase: null, // null = missing, not unknown
  dictionary: null, // null = missing, not unknown
  isMissing: true,
});

/**
 * @param {{
 *   now: number,
 *   lastProgressUpdate: number,
 *   progressUpdateInterval: number,
 *   isLastBatch: boolean,
 *   enableStreaming: boolean,
 *   batchIndex: number,
 *   processedChunks: number,
 *   totalChunks: number,
 *   currentBatchSize: number,
 *   semanticArrays: { original?: Array<*>, translated?: Array<*>, metadata?: Array<*> } | null | undefined,
 *   progressText: string,
 * }} input
 * @returns {{ send: true, payload: object } | { send: false, log: { level: 'debug', message: string } }}
 */
export function buildProgressiveProgressUpdate({
  now,
  lastProgressUpdate,
  progressUpdateInterval,
  isLastBatch,
  enableStreaming,
  batchIndex,
  processedChunks,
  totalChunks,
  currentBatchSize,
  semanticArrays,
  progressText,
}) {
  const timeSinceLastUpdate = now - lastProgressUpdate;
  const shouldSendUpdate =
    enableStreaming &&
    (timeSinceLastUpdate >= progressUpdateInterval || isLastBatch) &&
    (batchIndex % 3 === 0 || isLastBatch);

  if (!shouldSendUpdate) {
    return {
      send: false,
      log: {
        level: 'debug',
        message: `⏭️ Skipped progress update (${timeSinceLastUpdate.toFixed(0)}ms since last update, threshold: ${progressUpdateInterval}ms)`,
      },
    };
  }

  const remainingChunks = totalChunks - processedChunks;
  const estimatedRemainingBatches = Math.ceil(remainingChunks / currentBatchSize);
  const estimatedTotalBatches = batchIndex + estimatedRemainingBatches;

  const arrays = semanticArrays || { original: [], translated: [], metadata: [] };
  const targetLength = arrays.original?.length || 0;
  const progressiveMetadata = arrays.metadata ? arrays.metadata.slice() : [];
  for (let i = progressiveMetadata.length; i < targetLength; i++) {
    progressiveMetadata[i] = DEFAULT_METADATA;
  }

  return {
    send: true,
    payload: {
      currentBatch: batchIndex,
      totalBatches: estimatedTotalBatches,
      completedChunks: processedChunks,
      totalChunks,
      partialTranslation: progressText,
      isComplete: isLastBatch,
      semanticArrays: {
        original: arrays.original ? [...arrays.original] : [],
        translated: arrays.translated ? [...arrays.translated] : [],
        metadata: progressiveMetadata,
      },
    },
  };
}
