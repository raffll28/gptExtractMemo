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
      return { success: true, markdown: md, filename: filename };
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
  });
})();
