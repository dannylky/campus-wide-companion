const SYSTEM_PROMPT = `You are the Campus Wide Companion advisor.

You help AV operations staff understand a campus Bitfocus Companion deployment.
You are strictly read-only: you never press buttons, restart connections, import configs, or change devices.
Answer from the supplied context. Cite sources as [1], [2], ... using the numbered context entries.
If the context is insufficient, say what is missing and suggest which knowledge-base page or export to inspect.
Keep answers short, concrete, and operational. Prefer room IDs, connection labels, module IDs, and ports.
Never invent IP addresses, room names, or device states.`;

function config(env = process.env) {
  return {
    baseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: String(env.OPENAI_API_KEY || ''),
    model: String(env.OPENAI_MODEL || 'gpt-4o-mini'),
    temperature: Number.isFinite(Number(env.OPENAI_TEMPERATURE)) ? Number(env.OPENAI_TEMPERATURE) : 0.2,
  };
}

export function aiStatus(env = process.env) {
  const cfg = config(env);
  return { enabled: Boolean(cfg.apiKey), model: cfg.model, baseUrl: cfg.baseUrl, mode: cfg.apiKey ? 'cloud' : 'offline' };
}

function fallbackAnswer(question, results, snapshot) {
  if (!results.length) {
    return {
      answer: `I could not find a matching knowledge-base entry for "${question}". Try a room ID, module ID (for example generic-pjlink), or a room type.`,
      citations: [],
      mode: 'offline',
    };
  }
  const lines = results.slice(0, 4).map((result, index) => `[${index + 1}] ${result.title}: ${result.snippet}`);
  const faultLine = snapshot?.counts
    ? `Current snapshot: ${snapshot.counts.total} spaces, ${snapshot.counts.error || 0} faults, ${snapshot.counts.warning || 0} warnings, ${snapshot.counts.suspended || 0} suspended.`
    : '';
  return {
    answer: [`Knowledge-base matches for "${question}":`, ...lines, faultLine].filter(Boolean).join('\n\n'),
    citations: results.slice(0, 4).map((result) => ({ id: result.id, title: result.title, type: result.type, source: result.source })),
    mode: 'offline',
  };
}

export async function ask({ question, kb, snapshot, env = process.env, fetchImpl = globalThis.fetch }) {
  const clean = String(question || '').trim();
  if (!clean) return { answer: 'Ask a question about a room, device, module, or fault.', citations: [], mode: 'offline' };

  const results = kb.search(clean, 6);
  const cfg = config(env);
  if (!cfg.apiKey) return fallbackAnswer(clean, results, snapshot);

  const context = results
    .map((result, index) => `[${index + 1}] ${result.title}\n${result.snippet}`)
    .join('\n\n');
  const summary = snapshot?.counts
    ? `Snapshot: ${snapshot.counts.total} spaces; ok ${snapshot.counts.ok || 0}; warning ${snapshot.counts.warning || 0}; error ${snapshot.counts.error || 0}; off ${snapshot.counts.off || 0}; suspended ${snapshot.counts.suspended || 0}.`
    : '';

  const user = [`Question: ${clean}`, summary, `Context:\n${context || '(no matching entries)'}`].filter(Boolean).join('\n\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        ...fallbackAnswer(clean, results, snapshot),
        warning: `AI request failed: HTTP ${response.status} ${text.slice(0, 200)}`,
      };
    }
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content || fallbackAnswer(clean, results, snapshot).answer;
    return {
      answer,
      citations: results.map((result) => ({ id: result.id, title: result.title, type: result.type, source: result.source })),
      mode: 'cloud',
      model: cfg.model,
    };
  } catch (error) {
    return {
      ...fallbackAnswer(clean, results, snapshot),
      warning: `AI request failed: ${error.name === 'AbortError' ? 'timeout' : error.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
