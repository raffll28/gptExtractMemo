/**
 * extract.js — Leitura do DOM do ChatGPT para estrutura da conversa.
 *
 * Seletores baseados em data-message-author-role e estrutura atual do chat.openai.com.
 * Se o site mudar, ajustar os SELECTORS abaixo. Manter fallbacks para resiliência.
 */

const SELECTORS = {
  messageBlock: 'div[data-message-author-role]',
  messageContent: '[data-message-author-role] .markdown, [data-message-author-role] [class*="markdown"]',
  codeBlock: 'pre code, [class*="code"] code',
};

const BLOCK_TAGS = { P: 1, LI: 1, H1: 1, H2: 1, H3: 1, PRE: 1 };

function isCodeBlockContainer(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (el.tagName || '').toUpperCase();
  const className = typeof el.className === 'string' ? el.className : '';
  return (tag === 'DIV' || tag === 'SECTION' || tag === 'FIGURE') && /code|syntax|highlight/i.test(className);
}

function getCodeBlockFromElement(el) {
  const code = el.querySelector('code');
  const text = code ? code.textContent : el.textContent;
  const langEl = el.querySelector('[class*="language-"]') || (code || null);
  const langMatch = langEl && langEl.className && String(langEl.className).match(/language-(\w+)/);
  const lang = langMatch ? langMatch[1] : '';
  return '\n```' + lang + '\n' + (text || '').trim() + '\n```\n';
}

/**
 * Extrai o texto de um elemento, preservando blocos de código quando existirem.
 */
function getMessageContent(container) {
  const contentSelectors = [
    '.markdown',
    '[class*="markdown"]',
    '[class*="Message"]',
    'div[dir="auto"]',
  ];

  let contentRoot = null;
  for (const sel of contentSelectors) {
    contentRoot = container.querySelector(sel);
    if (contentRoot) break;
  }

  if (!contentRoot) {
    const textNodes = container.querySelectorAll('p, li, div[dir="auto"]');
    if (textNodes.length) {
      return Array.from(textNodes)
        .map((el) => el.textContent.trim())
        .filter(Boolean)
        .join('\n\n');
    }
    return container.textContent.trim() || '';
  }

  const parts = [];
  let inlineBuf = '';

  function flushInline() {
    const s = inlineBuf.trim();
    if (s) parts.push(s);
    inlineBuf = '';
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineBuf += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;

    if (el.tagName === 'PRE' && el.querySelector('code')) {
      flushInline();
      parts.push(getCodeBlockFromElement(el));
      return;
    }
    if (el.tagName === 'CODE' && el.closest('pre')) return;

    if (isCodeBlockContainer(el)) {
      flushInline();
      parts.push(getCodeBlockFromElement(el));
      return;
    }

    if (el.tagName === 'P') {
      flushInline();
      parts.push(el.textContent.trim());
      return;
    }
    if (el.tagName === 'LI') {
      flushInline();
      parts.push('- ' + el.textContent.trim());
      return;
    }
    if (el.tagName === 'H1') {
      flushInline();
      parts.push('# ' + el.textContent.trim());
      return;
    }
    if (el.tagName === 'H2') {
      flushInline();
      parts.push('## ' + el.textContent.trim());
      return;
    }
    if (el.tagName === 'H3') {
      flushInline();
      parts.push('### ' + el.textContent.trim());
      return;
    }

    flushInline();
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        inlineBuf += child.textContent || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const isBlock = BLOCK_TAGS[(child.tagName || '').toUpperCase()] || isCodeBlockContainer(child);
        if (isBlock) {
          flushInline();
          if (isCodeBlockContainer(child)) {
            parts.push(getCodeBlockFromElement(child));
          } else {
            walk(child);
          }
        } else {
          inlineBuf += child.textContent || '';
        }
      }
    }
    flushInline();
  }

  walk(contentRoot);
  flushInline();
  return parts.filter(Boolean).join('\n\n');
}

function extract() {
  const messages = [];
  const blocks = document.querySelectorAll(SELECTORS.messageBlock);

  for (const block of blocks) {
    const role = (block.getAttribute('data-message-author-role') || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;

    const content = getMessageContent(block);
    if (!content.trim()) continue;

    messages.push({ role: role === 'user' ? 'user' : 'assistant', content: content.trim() });
  }

  return messages;
}

if (typeof window !== 'undefined') {
  window.GPTExtract = window.GPTExtract || {};
  window.GPTExtract.extract = extract;
}
