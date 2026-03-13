/**
 * content.js — Orquestração: mensagem do popup → export → download.
 */

(function () {
  function doExport(returnContent) {
    if (!window.GPTExtract || !window.GPTExtract.extract || !window.GPTExtract.toMarkdown) {
      return { success: false, error: 'Extensão não pronta. Recarregue a página.' };
    }

    const messages = window.GPTExtract.extract();
    if (!messages.length) {
      return { success: false, error: 'Nenhuma mensagem encontrada nesta conversa.' };
    }

    const md = window.GPTExtract.toMarkdown(messages, {
      title: 'Conversa ChatGPT',
      date: new Date(),
    });

    const filename = window.GPTExtract.getDefaultFilename
      ? window.GPTExtract.getDefaultFilename()
      : `chatgpt-${Date.now()}.md`;

    if (returnContent) {
      const pathname = window.location.pathname || '';
      const idMatch = pathname.match(/\/c\/([a-f0-9-]+)/i);
      const conversationId = idMatch ? idMatch[1] : undefined;
      return { success: true, markdown: md, filename: filename, conversationId: conversationId };
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true };
  }

  function getConversationList() {
    const links = document.querySelectorAll('#history a[data-sidebar-item="true"], a[data-sidebar-item="true"][href*="/c/"]');
    const base = window.location.origin;
    const conversations = [];
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || !href.includes('/c/')) continue;
      const title =
        link.getAttribute('aria-label') ||
        (link.querySelector('span[dir="auto"]') && link.querySelector('span[dir="auto"]').textContent) ||
        (link.querySelector('.truncate span') && link.querySelector('.truncate span').textContent) ||
        '';
      conversations.push({ url: base + href, title: (title || 'Conversa').trim() });
    }
    return { success: true, conversations: conversations };
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message && message.action === 'doExport') {
      try {
        const result = doExport(message.returnContent === true);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: (err && err.message) || 'Erro ao exportar.' });
      }
      return true;
    }
    if (message && message.action === 'getConversationList') {
      try {
        sendResponse(getConversationList());
      } catch (err) {
        sendResponse({ success: true, conversations: [] });
      }
      return true;
    }
  });
})();
