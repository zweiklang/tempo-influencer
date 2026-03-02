import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config', () => ({
  getEncryptionSalt: () => 'test-salt-for-testing-purposes-32b',
}));

import { encrypt, decrypt } from '../crypto';

describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const plaintext = 'hello world';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('round-trips empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trips unicode text', () => {
    const text = 'こんにちは 🔐 world';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const enc1 = encrypt('same');
    const enc2 = encrypt('same');
    expect(enc1).not.toBe(enc2);
  });

  it('produces hex-colon-separated output with 3 parts', () => {
    const enc = encrypt('test');
    const parts = enc.split(':');
    expect(parts).toHaveLength(3);
    // Each part should be valid hex
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('throws on invalid encrypted string format', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid encrypted string format');
    expect(() => decrypt('a:b')).toThrow('Invalid encrypted string format');
  });
});
