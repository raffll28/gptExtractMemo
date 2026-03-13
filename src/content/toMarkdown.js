/**
 * toMarkdown.js — Converte array de mensagens em string Markdown.
 */

/**
 * Gera nome de arquivo único: chatgpt-YYYY-MM-DD-HHmm.md
 * @param {string} [titleHint] - Opcional: primeiras palavras do título da conversa
 * @returns {string}
 */
function getDefaultFilename(titleHint) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const base = `chatgpt-${y}-${m}-${d}-${h}${min}`;
  if (titleHint && titleHint.trim()) {
    const slug = titleHint.trim().slice(0, 40).replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `${base}-${slug}.md`;
  }
  return `${base}.md`;
}

/**
 * Converte lista de mensagens em documento Markdown.
 * @param {{ role: 'user'|'assistant', content: string }[]} messages
 * @param {{ title?: string, date?: Date }} [options]
 * @returns {string}
 */
function toMarkdown(messages, options) {
  const opts = options || {};
  const title = opts.title || 'Conversa ChatGPT';
  const date = opts.date || new Date();
  const dateStr = date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const lines = [
    `# ${title}`,
    '',
    `*Exportado em ${dateStr}*`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const heading = msg.role === 'user' ? '## User' : '## Assistant';
    lines.push(heading);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

if (typeof window !== 'undefined') {
  window.GPTExtract = window.GPTExtract || {};
  window.GPTExtract.toMarkdown = toMarkdown;
  window.GPTExtract.getDefaultFilename = getDefaultFilename;
}
