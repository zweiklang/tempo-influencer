import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAvailableModels, suggestRoles } from '../geminiClient';

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAvailableModels', () => {
  it('returns only generateContent-capable models', async () => {
    vi.stubGlobal('fetch', makeFetch(200, {
      models: [
        { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-bison', displayName: 'Text Bison', supportedGenerationMethods: ['predict'] },
      ],
    }));
    const models = await getAvailableModels('api-key');
    expect(models).toHaveLength(1);
    expect(models[0]).toEqual({ id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' });
  });

  it('strips models/ prefix from id', async () => {
    vi.stubGlobal('fetch', makeFetch(200, {
      models: [{ name: 'models/gemini-1.5-pro', displayName: 'Pro', supportedGenerationMethods: ['generateContent'] }],
    }));
    const models = await getAvailableModels('key');
    expect(models[0].id).toBe('gemini-1.5-pro');
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', makeFetch(403, 'Forbidden'));
    await expect(getAvailableModels('bad-key')).rejects.toThrow('Gemini models API error 403');
  });

  it('returns empty array when models field is absent', async () => {
    vi.stubGlobal('fetch', makeFetch(200, {}));
    const models = await getAvailableModels('key');
    expect(models).toEqual([]);
  });
});

describe('suggestRoles', () => {
  const issues = [{ id: 1, key: 'PROJ-1', summary: 'Build login page' }];
  const roles = [{ id: 10, name: 'Frontend Developer' }];

  it('returns parsed suggestions from Gemini response', async () => {
    const responseText = JSON.stringify({ suggestions: [{ issueId: 1, roleIds: [10] }] });
    vi.stubGlobal('fetch', makeFetch(200, {
      candidates: [{ content: { parts: [{ text: responseText }] } }],
    }));
    const result = await suggestRoles(issues, roles, 'api-key');
    expect(result).toEqual([{ issueId: 1, roleIds: [10] }]);
  });

  it('throws when candidates are empty', async () => {
    vi.stubGlobal('fetch', makeFetch(200, { candidates: [] }));
    await expect(suggestRoles(issues, roles, 'api-key')).rejects.toThrow('Gemini returned empty response');
  });

  it('throws on Gemini API error', async () => {
    vi.stubGlobal('fetch', makeFetch(429, 'quota exceeded'));
    await expect(suggestRoles(issues, roles, 'api-key')).rejects.toThrow('Gemini API error 429');
  });
});
