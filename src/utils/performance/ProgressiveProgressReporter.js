/**
 * Builds the onProgress payload for translateWithProgressiveBatches (architecture
 * review 2026-07-29, candidate #1). Pure function of its inputs — no `this`, no
 * engine state. Owns: the debounce gate (time-since-last-update + every-3rd-batch +
 * last-batch-always) and the copy of the semantic arrays.
 *
 * The deep-clone is load-bearing, not decorative: React state updates receive direct
 * references, and the next batch continues mutating the same arrays after React has
 * already scheduled a render from them — without cloning here, the semantic-array
 * consumer can crash on an array-size mismatch against the text length it was
 * rendered against (see the CRITICAL FIX comment this was extracted from).
 */

/**
 * Copy the builder's arrays for a callback. The builder keeps `original`, `translated` and
 * `metadata` one length (`addUnit` writes the three together, `getArrays` returns all of them
 * to `length`), so nothing is padded. The arrays are copied, the entries are not: the next batch keeps appending to the builder,
 * so a callback must never receive its live arrays. Shared by onProgress and onBatchComplete.
 *
 * @param {{ original?: Array<*>, translated?: Array<*>, metadata?: Array<*> } | null | undefined} semanticArrays
 * @returns {{ original: Array<*>, translated: Array<*>, metadata: Array<*> }}
 */
export function snapshotSemanticArrays(semanticArrays) {
  const arrays = semanticArrays || { original: [], translated: [], metadata: [] };
  return {
    original: arrays.original ? [...arrays.original] : [],
    translated: arrays.translated ? [...arrays.translated] : [],
    metadata: arrays.metadata ? arrays.metadata.slice() : [],
  };
}

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

  return {
    send: true,
    payload: {
      currentBatch: batchIndex,
      totalBatches: estimatedTotalBatches,
      completedChunks: processedChunks,
      totalChunks,
      partialTranslation: progressText,
      isComplete: isLastBatch,
      semanticArrays: snapshotSemanticArrays(semanticArrays),
    },
  };
}
