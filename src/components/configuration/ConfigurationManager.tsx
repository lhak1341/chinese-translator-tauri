import React, { useState, useEffect } from 'react';
import { PlusCircle, Loader, AlertCircle, Pencil, Check, X, Bookmark, Zap } from 'lucide-react';

/**
 * ConfigurationManager Component
 *
 * Manages application configuration including:
 * - WebAssembly acceleration settings
 * - Active proper nouns dictionaries
 * - Creating new custom dictionaries
 *
 * @returns Configuration management interface
 */
const ConfigurationManager: React.FC = () => {
  const [availableDictionaries, setAvailableDictionaries] = useState<string[]>([]);
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDictionaryModal, setShowNewDictionaryModal] = useState<boolean>(false);
  const [newDictionaryName, setNewDictionaryName] = useState<string>('');

  // WASM Configuration State
  const [wasmEnabled, setWasmEnabled] = useState<boolean>(true);
  const [wasmMemoryLimit, setWasmMemoryLimit] = useState<number>(20);

  // Rename state
  const [renamingDictionaryId, setRenamingDictionaryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Default Cmd-5 dictionary state
  const [defaultQuickAddDictionary, setDefaultQuickAddDictionary] = useState<string | null>(null);

  // Sort dictionaries: general 'properNouns' first, then custom ones alphabetically
  const sortDictionaries = (dictionaries: string[]): string[] => {
    return dictionaries.sort((a, b) => {
      // Always put 'properNouns' first
      if (a === 'properNouns') return -1;
      if (b === 'properNouns') return 1;
      // Sort custom dictionaries alphabetically
      return a.localeCompare(b);
    });
  };

  // Load available dictionaries on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const result = await window.electronAPI.listProperNounsDictionaries();
        if (result.success && result.dictionaries) {
          const dictionaryIds = result.dictionaries.map((d) => (typeof d === 'string' ? d : d.id));
          setAvailableDictionaries(sortDictionaries(dictionaryIds));

          // Load active dictionaries from saved configuration
          const configResult = await window.electronAPI.loadConfiguration();
          if (configResult.success && configResult.data) {
            setActiveDictionaries(configResult.data.activeProperNouns || ['properNouns']);

            // Load WASM configuration
            setWasmEnabled(configResult.data.wasmEnabled !== false); // Default to enabled
            setWasmMemoryLimit(configResult.data.wasmMemoryLimit || 20); // Default 20MB

            // Load default Cmd-5 dictionary
            setDefaultQuickAddDictionary(configResult.data.defaultQuickAddDictionary || null);
          }
        } else {
          throw new Error(result.error || 'Failed to load dictionaries');
        }
      } catch (err) {
        setError('Failed to load dictionaries: ' + (err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadDictionaries();
  }, []);

  // Handle dictionary activation toggle
  const handleToggleDictionary = async (dictionaryId: string): Promise<void> => {
    try {
      const newActiveDictionaries = activeDictionaries.includes(dictionaryId)
        ? activeDictionaries.filter((id) => id !== dictionaryId)
        : [...activeDictionaries, dictionaryId];

      // Save configuration (including WASM settings and default Cmd-5 dictionary)
      const result = await window.electronAPI.saveConfiguration({
        activeProperNouns: newActiveDictionaries,
        wasmEnabled: wasmEnabled,
        wasmMemoryLimit: wasmMemoryLimit,
        defaultQuickAddDictionary: defaultQuickAddDictionary,
      });

      if (result.success) {
        setActiveDictionaries(newActiveDictionaries);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to update configuration: ' + (err as Error).message);
    }
  };

  // Handle creating new dictionary
  const handleCreateDictionary = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newDictionaryName.trim()) return;

    try {
      const dictionaryId = `properNouns-${newDictionaryName.trim().replace(/\s+/g, '')}`;
      const result = await window.electronAPI.createProperNounsDictionary(dictionaryId);

      if (result.success) {
        setAvailableDictionaries(sortDictionaries([...availableDictionaries, dictionaryId]));
        setShowNewDictionaryModal(false);
        setNewDictionaryName('');
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to create dictionary: ' + (err as Error).message);
    }
  };

  // Handle WASM configuration changes
  const handleWasmToggle = async (enabled: boolean): Promise<void> => {
    try {
      const result = await window.electronAPI.saveConfiguration({
        activeProperNouns: activeDictionaries,
        wasmEnabled: enabled,
        wasmMemoryLimit: wasmMemoryLimit,
        defaultQuickAddDictionary: defaultQuickAddDictionary,
      });

      if (result.success) {
        setWasmEnabled(enabled);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to update WASM configuration: ' + (err as Error).message);
    }
  };

  const handleMemoryLimitChange = async (limit: number): Promise<void> => {
    try {
      const result = await window.electronAPI.saveConfiguration({
        activeProperNouns: activeDictionaries,
        wasmEnabled: wasmEnabled,
        wasmMemoryLimit: limit,
        defaultQuickAddDictionary: defaultQuickAddDictionary,
      });

      if (result.success) {
        setWasmMemoryLimit(limit);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to update memory limit: ' + (err as Error).message);
    }
  };

  // Handle rename dictionary
  const handleStartRename = (dictionaryId: string): void => {
    if (dictionaryId === 'properNouns') return; // Cannot rename default

    // Extract the name part (remove "properNouns-" prefix)
    const name = dictionaryId.replace('properNouns-', '');
    setRenamingDictionaryId(dictionaryId);
    setRenameValue(name);
  };

  const handleCancelRename = (): void => {
    setRenamingDictionaryId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (): Promise<void> => {
    if (!renamingDictionaryId || !renameValue.trim()) return;

    try {
      const newDictionaryId = `properNouns-${renameValue.trim().replace(/\s+/g, '')}`;

      // Don't rename if the name hasn't changed
      if (newDictionaryId === renamingDictionaryId) {
        handleCancelRename();
        return;
      }

      const result = await window.electronAPI.renameProperNounsDictionary(
        renamingDictionaryId,
        newDictionaryId
      );

      if (result.success) {
        // Update the available dictionaries list and re-sort
        setAvailableDictionaries((prev) =>
          sortDictionaries(prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id)))
        );

        // Update active dictionaries if the renamed one was active
        setActiveDictionaries((prev) =>
          prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id))
        );

        // Update default Cmd-5 dictionary if the renamed one was the default
        if (defaultQuickAddDictionary === renamingDictionaryId) {
          setDefaultQuickAddDictionary(newDictionaryId);
        }

        handleCancelRename();
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to rename dictionary: ' + (err as Error).message);
    }
  };

  // Handle setting default Cmd-5 dictionary
  const handleSetDefaultQuickAdd = async (dictionaryId: string): Promise<void> => {
    try {
      // If clicking the same dictionary, unset it (toggle off)
      const newDefault = defaultQuickAddDictionary === dictionaryId ? null : dictionaryId;

      const result = await window.electronAPI.saveConfiguration({
        activeProperNouns: activeDictionaries,
        wasmEnabled: wasmEnabled,
        wasmMemoryLimit: wasmMemoryLimit,
        defaultQuickAddDictionary: newDefault,
      });

      if (result.success) {
        setDefaultQuickAddDictionary(newDefault);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError('Failed to set default Cmd-5 dictionary: ' + (err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '0.75rem',
        }}
      >
        <Loader size={20} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Loading configuration...
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '1.5rem',
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: 'var(--background-color)',
      }}
    >
      {/* WASM Configuration Section */}
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <h2
          style={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--text-color)',
            margin: 0,
            marginBottom: '1rem',
          }}
        >
          Performance
        </h2>

        <div>
          {/* Toggle row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: wasmEnabled ? '1rem' : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Zap
                size={14}
                style={{ color: wasmEnabled ? 'var(--warning-color)' : 'var(--text-muted)' }}
              />
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-color)' }}>
                  WASM Acceleration
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {wasmEnabled ? 'Rust-powered dictionary lookups' : 'JavaScript fallback mode'}
                </div>
              </div>
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => handleWasmToggle(!wasmEnabled)}
              aria-pressed={wasmEnabled}
              aria-label="Toggle WASM Acceleration"
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: wasmEnabled ? 'var(--primary-color)' : 'var(--border-color)',
                transition: 'background 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'white',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  position: 'absolute',
                  left: wasmEnabled ? '23px' : '3px',
                  transition: 'left 0.2s ease',
                }}
              />
            </button>
          </div>

          {/* Memory slider - only show when enabled */}
          {wasmEnabled && (
            <div
              style={{
                padding: '0.75rem',
                background: 'var(--background-color)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Memory Limit
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--primary-color)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {wasmMemoryLimit}MB
                </span>
              </div>
              {/* Custom slider track */}
              <div
                style={{
                  position: 'relative',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  const value = Math.round(10 + percent * 40);
                  handleMemoryLimitChange(Math.max(10, Math.min(50, value)));
                }}
              >
                {/* Track background */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'var(--border-color)',
                    borderRadius: '2px',
                  }}
                />
                {/* Track fill */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: `${((wasmMemoryLimit - 10) / 40) * 100}%`,
                    height: '4px',
                    background: 'var(--primary-color)',
                    borderRadius: '2px',
                  }}
                />
                {/* Thumb */}
                <div
                  style={{
                    position: 'absolute',
                    left: `calc(${((wasmMemoryLimit - 10) / 40) * 100}% - 8px)`,
                    width: '16px',
                    height: '16px',
                    background: 'white',
                    border: '2px solid var(--primary-color)',
                    borderRadius: '50%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    cursor: 'grab',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const track = e.currentTarget.parentElement;
                    if (!track) return;

                    const handleMove = (moveEvent: MouseEvent) => {
                      const rect = track.getBoundingClientRect();
                      const percent = (moveEvent.clientX - rect.left) / rect.width;
                      const value = Math.round(10 + percent * 40);
                      handleMemoryLimitChange(Math.max(10, Math.min(50, value)));
                    };

                    const handleUp = () => {
                      document.removeEventListener('mousemove', handleMove);
                      document.removeEventListener('mouseup', handleUp);
                    };

                    document.addEventListener('mousemove', handleMove);
                    document.addEventListener('mouseup', handleUp);
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.25rem',
                }}
              >
                <span>10MB</span>
                <span>30MB</span>
                <span>50MB</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dictionaries Section */}
      <div
        style={{
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <h2
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--text-color)',
                margin: 0,
              }}
            >
              Dictionaries
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              {activeDictionaries.length} active
            </span>
          </div>
          <button
            onClick={() => setShowNewDictionaryModal(true)}
            className="primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <PlusCircle size={14} />
            New
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.625rem 0.75rem',
              marginBottom: '0.75rem',
              backgroundColor: 'var(--error-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.8125rem',
              color: 'var(--error-color)',
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '0.5rem',
          }}
        >
          {availableDictionaries.map((dictionaryId) => {
            const isChecked = activeDictionaries.includes(dictionaryId);
            const isRenaming = renamingDictionaryId === dictionaryId;
            const canRename = dictionaryId !== 'properNouns';
            const isDefaultQuickAdd = defaultQuickAddDictionary === dictionaryId;
            const isCustomProperNoun = dictionaryId.startsWith('properNouns-');

            return (
              <div
                key={dictionaryId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: isChecked ? 'var(--success-subtle)' : 'var(--surface-color)',
                  border: `1px solid ${isChecked ? 'var(--success-color)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRenaming ? (
                  // Rename mode
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename();
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '0.375rem 0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8125rem',
                        background: 'var(--background-color)',
                        color: 'var(--text-color)',
                      }}
                    />
                    <button
                      onClick={handleConfirmRename}
                      style={{
                        padding: '0.375rem',
                        background: 'var(--success-color)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'white',
                      }}
                      title="Confirm rename"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={handleCancelRename}
                      style={{
                        padding: '0.375rem',
                        background: 'var(--error-color)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'white',
                      }}
                      title="Cancel rename"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  // Normal mode
                  <>
                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        color: isChecked ? 'var(--success-color)' : 'var(--text-color)',
                        fontWeight: isChecked ? 500 : 'normal',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDictionary(dictionaryId)}
                        style={{ accentColor: 'var(--success-color)' }}
                      />
                      {dictionaryId === 'properNouns'
                        ? 'General Purpose Dictionary'
                        : dictionaryId.replace('properNouns-', '')}
                    </label>
                    {/* Bookmark icon for setting Cmd-5 default (only for active custom proper noun dictionaries) */}
                    {isChecked && isCustomProperNoun && (
                      <button
                        onClick={() => handleSetDefaultQuickAdd(dictionaryId)}
                        style={{
                          padding: '0.375rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          color: isDefaultQuickAdd ? 'var(--error-color)' : 'var(--text-muted)',
                          transition: 'color 0.15s ease',
                        }}
                        title={
                          isDefaultQuickAdd
                            ? 'Default Cmd-5 dictionary (click to unset)'
                            : 'Set as default Cmd-5 dictionary'
                        }
                      >
                        <Bookmark
                          size={15}
                          fill={isDefaultQuickAdd ? 'var(--error-color)' : 'none'}
                        />
                      </button>
                    )}
                    {canRename && (
                      <button
                        onClick={() => handleStartRename(dictionaryId)}
                        style={{
                          padding: '0.375rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          color: 'var(--text-muted)',
                          transition: 'color 0.15s ease',
                        }}
                        title="Rename dictionary"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showNewDictionaryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-color)',
              padding: '1.5rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              width: '100%',
              maxWidth: '400px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3
              style={{
                marginBottom: '1rem',
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--text-color)',
              }}
            >
              Create New Dictionary
            </h3>
            <form onSubmit={handleCreateDictionary}>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.375rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--text-color)',
                  }}
                >
                  Dictionary Name
                </label>
                <input
                  type="text"
                  value={newDictionaryName}
                  onChange={(e) => setNewDictionaryName(e.target.value)}
                  placeholder="e.g., HarryPotter, JourneyToTheWest"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    background: 'var(--background-color)',
                    color: 'var(--text-color)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowNewDictionaryModal(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.5rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-color)',
                    color: 'var(--text-color)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={!newDictionaryName.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.5rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: newDictionaryName.trim() ? 'pointer' : 'not-allowed',
                    border: 'none',
                    opacity: newDictionaryName.trim() ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationManager;
