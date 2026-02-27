const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function getAvailableModels(apiKey: string): Promise<{ id: string; displayName: string }[]> {
  const response = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini models API error ${response.status}: ${text}`);
  }
  const data = (await response.json()) as {
    models?: Array<{
      name: string;
      displayName: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName,
    }));
}

export interface GeminiIssue {
  id: number;
  key: string;
  summary: string;
  labels?: string[];
  parentSummary?: string;
}

export interface GeminiRole {
  id: number;
  name: string;
  description?: string;
}

export interface RoleSuggestion {
  issueId: number;
  roleIds: number[];
}

const SYSTEM_PROMPT = `You are a project management assistant for a digital agency. Your job is to assign team roles to Jira issues based on their content.

Rules:
- Assign 1–3 roles per issue — the roles most likely to do meaningful work on it
- Prefer specificity: a design-heavy issue should get design roles, a backend issue should get engineering roles
- Use ONLY the exact integer role IDs provided in the user message
- Every issue in the input MUST appear in your output, even if you assign an empty roleIds array
- Return exact issueId values from the input — do not invent or change them`;

export async function suggestRoles(
  issues: GeminiIssue[],
  roles: GeminiRole[],
  apiKey: string,
  model = 'gemini-2.0-flash'
): Promise<RoleSuggestion[]> {
  const rolesText = roles
    .map((r) => `{id: ${r.id}, name: "${r.name}"${r.description ? `, description: "${r.description}"` : ''}}`)
    .join(', ');
  const issuesText = issues
    .map((i) => {
      const parts = [`{id: ${i.id}, key: "${i.key}", summary: "${i.summary}"`];
      if (i.labels && i.labels.length > 0) parts.push(`, labels: [${i.labels.map((l) => `"${l}"`).join(', ')}]`);
      if (i.parentSummary) parts.push(`, parentSummary: "${i.parentSummary}"`);
      return parts.join('') + '}';
    })
    .join(', ');

  const userMessage = `Available roles:\n[${rolesText}]\n\nIssues to assign:\n[${issuesText}]`;

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          suggestions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                issueId: { type: 'INTEGER' },
                roleIds: { type: 'ARRAY', items: { type: 'INTEGER' } },
              },
              required: ['issueId', 'roleIds'],
            },
          },
        },
        required: ['suggestions'],
      },
    },
  };

  const url = `${GEMINI_BASE}/models/${model}:generateContent`;
  const response = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  let parsed: { suggestions: RoleSuggestion[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('Gemini response missing suggestions array');
  }

  return parsed.suggestions;
}
