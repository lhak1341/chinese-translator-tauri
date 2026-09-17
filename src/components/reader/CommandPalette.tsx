import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { filterPaletteCommands, type PaletteCommand } from '../../utils/reader/PaletteCommands';
import styles from '../../styles/Reader.module.css';

interface CommandPaletteProps {
  /** Every action the palette offers, already built — see `PaletteCommands`. */
  commands: readonly PaletteCommand[];
  onClose: () => void;
}

/**
 * One key for everything done occasionally.
 *
 * The palette is the parallel path to actions that also have direct bindings, not a
 * replacement for them — so every row shows its shortcut, and the palette is where those
 * shortcuts are found. Choosing a row runs it and closes; Escape closes without running.
 *
 * Its search input holds focus the whole time it is open, which is also what keeps the
 * global hotkeys quiet underneath it: `matchHotkey` returns null while an input has
 * focus, so Cmd+K cannot re-enter the palette from inside itself and typing `[` filters
 * rather than stepping a chapter.
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({ commands, onClose }) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matched = useMemo(() => filterPaletteCommands(commands, query), [commands, query]);

  // The filtered list shrinks under the highlight as the query narrows, so the index is
  // clamped at read time rather than reset on every keystroke — that keeps the arrows'
  // position through a backspace that widens the list again.
  const activeIndex = matched.length === 0 ? -1 : Math.min(highlighted, matched.length - 1);

  const choose = (command: PaletteCommand): void => {
    // Close first: several of these open a dialog or a panel of their own, and the
    // palette must not be the thing on top when they do.
    onClose();
    command.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setHighlighted((previous) => Math.min(previous + 1, Math.max(matched.length - 1, 0)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlighted((previous) => Math.max(previous - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const command = activeIndex >= 0 ? matched[activeIndex] : undefined;
        if (command) choose(command);
        break;
      }
    }
  };

  return (
    <div
      className={styles.paletteOverlay}
      role="dialog"
      aria-label="Command palette"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes — a drag that starts on a row and
        // ends out here must not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.palette}>
        <div className={styles.paletteSearch}>
          <Search size={14} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            aria-label="Command search"
          />
        </div>

        {matched.length === 0 ? (
          <div className={styles.paletteEmpty}>No commands match &ldquo;{query}&rdquo;.</div>
        ) : (
          <ul className={styles.paletteList}>
            {matched.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  className={`${styles.paletteRow} ${
                    index === activeIndex ? styles.paletteRowActive : ''
                  }`}
                  // Keeps the highlight where the pointer is, so Enter and a click never
                  // disagree about which row is about to run.
                  onMouseMove={() => setHighlighted(index)}
                  onClick={() => choose(command)}
                >
                  <span className={styles.paletteRowGroup}>{command.group}</span>
                  <span className={styles.paletteRowLabel}>{command.label}</span>
                  {command.hint && <kbd className={styles.paletteRowHint}>{command.hint}</kbd>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CommandPalette;
