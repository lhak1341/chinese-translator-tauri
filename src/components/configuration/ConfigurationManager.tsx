import React, { useState, useEffect } from 'react';
import { PlusCircle, Loader, AlertCircle, Pencil, Check, X, Bookmark } from 'lucide-react';

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

  // Load available dictionaries on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const result = await window.electronAPI.listProperNounsDictionaries();
        if (result.success && result.dictionaries) {
          setAvailableDictionaries(
            result.dictionaries.map((d) => (typeof d === 'string' ? d : d.id))
          );

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
        setAvailableDictionaries([...availableDictionaries, dictionaryId]);
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
        // Update the available dictionaries list
        setAvailableDictionaries((prev) =>
          prev.map((id) => (id === renamingDictionaryId ? newDictionaryId : id))
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
          gap: '1rem',
        }}
      >
        <Loader size={24} className="animate-spin" />
        <span>Loading configuration...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '2rem',
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {/* WASM Configuration Section */}
      <div style={{ marginBottom: '3rem' }}>
        <h2>🦀 WebAssembly Configuration</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
          Configure WASM acceleration for dictionary lookups. WASM provides significant performance
          improvements for large dictionaries but requires additional memory.
        </p>

        <div
          style={{
            padding: '1.5rem',
            backgroundColor: 'var(--background-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={wasmEnabled}
                onChange={(e) => handleWasmToggle(e.target.checked)}
                style={{ transform: 'scale(1.2)' }}
              />
              Enable WASM Acceleration
            </label>
          </div>

          {wasmEnabled && (
            <div
              style={{
                marginTop: '1rem',
                paddingLeft: '1rem',
                paddingRight: '3rem',
              }}
            >
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Memory Limit: {wasmMemoryLimit}MB
              </label>
              <input
                type="range"
                min="10"
                max="50"
                value={wasmMemoryLimit}
                onChange={(e) => handleMemoryLimitChange(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  marginBottom: '0.5rem',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  paddingLeft: '0.25rem',
                  paddingRight: '0.25rem',
                }}
              >
                <span>10MB (Minimal)</span>
                <span>30MB (Recommended)</span>
                <span>50MB (Maximum)</span>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: wasmEnabled ? '#e8f5e8' : '#fff3cd',
              border: `1px solid ${wasmEnabled ? '#10b981' : '#f59e0b'}`,
              borderRadius: '4px',
              fontSize: '0.75rem',
            }}
          >
            {wasmEnabled ? (
              <span style={{ color: '#065f46' }}>
                ✅ WASM enabled - Dictionary lookups will use Rust acceleration
              </span>
            ) : (
              <span style={{ color: '#92400e' }}>
                ⚠️ WASM disabled - Using JavaScript fallback (slower performance)
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Proper Nouns Dictionaries</h2>
        <p>
          Select which proper nouns dictionaries to use during translation. For active custom
          dictionaries, click the{' '}
          <Bookmark
            size={14}
            style={{ display: 'inline', verticalAlign: 'middle', marginBottom: '2px' }}
          />{' '}
          bookmark icon to set the default dictionary for Cmd/Ctrl-5 quick add.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: 'var(--danger-button-bg)',
            color: 'var(--danger-button-text)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setShowNewDictionaryModal(true)}
          className="primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <PlusCircle size={16} />
          Create New Dictionary
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '0.75rem',
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
                padding: '1rem',
                backgroundColor: isChecked ? '#f0fdf4' : 'var(--background-color)',
                border: `1px solid ${isChecked ? '#10b981' : 'var(--border-color)'}`,
                borderRadius: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              {isRenaming ? (
                // Rename mode
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      padding: '0.5rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                    }}
                  />
                  <button
                    onClick={handleConfirmRename}
                    style={{
                      padding: '0.5rem',
                      background: '#10b981',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                    }}
                    title="Confirm rename"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={handleCancelRename}
                    style={{
                      padding: '0.5rem',
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                    }}
                    title="Cancel rename"
                  >
                    <X size={16} />
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
                      gap: '1rem',
                      cursor: 'pointer',
                      color: isChecked ? '#065f46' : 'inherit',
                      fontWeight: isChecked ? 500 : 'normal',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleDictionary(dictionaryId)}
                      style={{ accentColor: '#10b981' }}
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
                        padding: '0.5rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: isDefaultQuickAdd ? '#ef4444' : '#d1d5db',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDefaultQuickAdd) e.currentTarget.style.color = '#f87171';
                      }}
                      onMouseLeave={(e) => {
                        if (!isDefaultQuickAdd) e.currentTarget.style.color = '#d1d5db';
                      }}
                      title={
                        isDefaultQuickAdd
                          ? 'Default Cmd-5 dictionary (click to unset)'
                          : 'Set as default Cmd-5 dictionary'
                      }
                    >
                      <Bookmark size={16} fill={isDefaultQuickAdd ? '#ef4444' : 'none'} />
                    </button>
                  )}
                  {canRename && (
                    <button
                      onClick={() => handleStartRename(dictionaryId)}
                      style={{
                        padding: '0.5rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: '#6b7280',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#10b981')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                      title="Rename dictionary"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {showNewDictionaryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--background-color)',
              padding: '2rem',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
            }}
          >
            <h3 style={{ marginBottom: '1.5rem' }}>Create New Dictionary</h3>
            <form onSubmit={handleCreateDictionary}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Dictionary Name:</label>
                <input
                  type="text"
                  value={newDictionaryName}
                  onChange={(e) => setNewDictionaryName(e.target.value)}
                  placeholder="e.g., HarryPotter, JourneyToTheWest"
                  style={{ width: '100%' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button type="button" onClick={() => setShowNewDictionaryModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={!newDictionaryName.trim()}>
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
