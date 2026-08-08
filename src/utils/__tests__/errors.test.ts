import { describe, it, expect } from 'vitest';
import { ValidationError } from '../errors';

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ValidationError');
    expect(error instanceof Error).toBe(true);
  });

  it('should include field and value in error', () => {
    const error = new ValidationError('Invalid field', 'testField', 123);

    expect(error.message).toBe('Invalid field');
    expect(error.field).toBe('testField');
    expect(error.value).toBe(123);
  });
});
