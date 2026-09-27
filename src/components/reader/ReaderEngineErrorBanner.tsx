import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useEngine } from '../EngineContext';
import styles from '../../styles/Reader.module.css';

/** The key the banner tells the reader to press. Displayed, so it is a second copy of the
 * dispatch table's binding: its test parses it back through `matchHotkey`. */
export const RELOAD_HINT = 'Cmd/Ctrl+R';

/**
 * Tells the reader the engine failed to start, when it has.
 *
 * `BookReader` only asks the engine while `enginePhase === 'ready'`, so a failed start
 * leaves every row as dimmed Chinese and nothing translating, which looks like a slow or
 * broken translation rather than a failure. `EngineProvider`'s error boundary never sees
 * this: initialization reports through `initError`, it does not throw. The Translator has
 * its own error panel; this is the Reader's.
 */
const ReaderEngineErrorBanner: React.FC = () => {
  const { enginePhase, initError } = useEngine();
  if (enginePhase !== 'error') return null;
  return (
    <div className={styles.error} role="alert">
      <AlertCircle size={15} />
      The translation engine failed to start, so this book stays in Chinese.{' '}
      {initError && <>{initError} </>}
      Reload dictionaries ({RELOAD_HINT}) to start it again.
    </div>
  );
};

export default ReaderEngineErrorBanner;
