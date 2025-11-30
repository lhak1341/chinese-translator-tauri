import React, { useState, useEffect } from 'react';
import { PlusCircle, Loader, AlertCircle } from 'lucide-react';

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

  // Load available dictionaries on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const result = await window.electronAPI.listProperNounsDictionaries();
        if (result.success && result.dictionaries) {
          setAvailableDictionaries(result.dictionaries.map(d => typeof d === 'string' ? d : d.id));

          // Load active dictionaries from saved configuration
          const configResult = await window.electronAPI.loadConfiguration();
          if (configResult.success && configResult.data) {
            setActiveDictionaries(
              configResult.data.activeProperNouns || ['properNouns']
            );

            // Load WASM configuration
            setWasmEnabled(configResult.data.wasmEnabled !== false); // Default to enabled
            setWasmMemoryLimit(configResult.data.wasmMemoryLimit || 20); // Default 20MB
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
        ? activeDictionaries.filter(id => id !== dictionaryId)
        : [...activeDictionaries, dictionaryId];

      // Save configuration (including WASM settings)
      const result = await window.electronAPI.saveConfiguration({
        activeProperNouns: newActiveDictionaries,
        wasmEnabled: wasmEnabled,
        wasmMemoryLimit: wasmMemoryLimit,
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
      const dictionaryId = `properNouns-${newDictionaryName
        .trim()
        .replace(/\s+/g, '')}`;
      const result = await window.electronAPI.createProperNounsDictionary(
        dictionaryId
      );

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
    <div style={{
      padding: '2rem',
      height: '100%',
      overflowY: 'auto',
      boxSizing: 'border-box'
    }}>
      {/* WASM Configuration Section */}
      <div style={{ marginBottom: '3rem' }}>
        <h2>🦀 WebAssembly Configuration</h2>
        <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
          Configure WASM acceleration for dictionary lookups. WASM provides significant performance improvements
          for large dictionaries but requires additional memory.
        </p>

        <div style={{
          padding: '1.5rem',
          backgroundColor: 'var(--background-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 500
            }}>
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
            <div style={{
              marginTop: '1rem',
              paddingLeft: '1rem',
              paddingRight: '3rem'
            }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500
              }}>
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
                  marginBottom: '0.5rem'
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                paddingLeft: '0.25rem',
                paddingRight: '0.25rem'
              }}>
                <span>10MB (Minimal)</span>
                <span>30MB (Recommended)</span>
                <span>50MB (Maximum)</span>
              </div>
            </div>
          )}

          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: wasmEnabled ? '#e8f5e8' : '#fff3cd',
            border: `1px solid ${wasmEnabled ? '#10b981' : '#f59e0b'}`,
            borderRadius: '4px',
            fontSize: '0.75rem'
          }}>
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
        <p>Select which proper nouns dictionaries to use during translation.</p>
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '0.75rem'
      }}>
        {availableDictionaries.map(dictionaryId => {
          const isChecked = activeDictionaries.includes(dictionaryId);
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
                transition: 'all 0.2s ease'
              }}
            >
              <label
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  cursor: 'pointer',
                  color: isChecked ? '#065f46' : 'inherit',
                  fontWeight: isChecked ? 500 : 'normal'
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
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Dictionary Name:
                </label>
                <input
                  type="text"
                  value={newDictionaryName}
                  onChange={e => setNewDictionaryName(e.target.value)}
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
                <button
                  type="button"
                  onClick={() => setShowNewDictionaryModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={!newDictionaryName.trim()}
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
