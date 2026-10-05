import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger.debugIfSlow', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // logger.debug prints in development only
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    nowSpy?.mockRestore();
    debugSpy.mockRestore();
  });

  const mockElapsed = (elapsedMs: number) => {
    let call = 0;
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => (call++ === 0 ? 0 : elapsedMs));
  };

  test('below the default 200ms threshold: does not log', () => {
    mockElapsed(199);
    logger.debugIfSlow('op', performance.now());
    expect(debugSpy).not.toHaveBeenCalled();
  });

  test('above the default 200ms threshold: logs with operation and duration', () => {
    mockElapsed(201);
    logger.debugIfSlow('slowOp', performance.now());

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const [message, details] = debugSpy.mock.calls[0].slice(-2);
    expect(message).toContain('slowOp');
    expect(details).toMatchObject({ duration: 201, threshold: 200 });
  });

  test('exactly at threshold: does not log (strictly greater-than)', () => {
    mockElapsed(200);
    logger.debugIfSlow('op', performance.now());
    expect(debugSpy).not.toHaveBeenCalled();
  });

  test('custom thresholdMs overrides the 200ms default', () => {
    mockElapsed(60);
    logger.debugIfSlow('op', performance.now(), {}, 50);
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  test('context is passed through to the debug call', () => {
    mockElapsed(300);
    logger.debugIfSlow('op', performance.now(), { batchSize: 7 });

    const [, details] = debugSpy.mock.calls[0].slice(-2);
    expect(details).toMatchObject({ context: { batchSize: 7 } });
  });
});

describe('logger dev/prod gating contract', () => {
  let originalEnv: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    logSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('production: log/info/debug are silenced', () => {
    process.env.NODE_ENV = 'production';
    logger.log('x');
    logger.info('x');
    logger.debug('x');

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  test('production: warn/error are always shown', () => {
    process.env.NODE_ENV = 'production';
    logger.warn('x');
    logger.error('x');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test('development: log/info/debug are shown', () => {
    process.env.NODE_ENV = 'development';
    logger.log('x');
    logger.info('x');
    logger.debug('x');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  test('development: warn/error are shown', () => {
    process.env.NODE_ENV = 'development';
    logger.warn('x');
    logger.error('x');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
