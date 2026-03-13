let folderHandle = null;

const statusEl = document.getElementById('status');
const folderLabel = document.getElementById('folder-label');
const folderSelectorEl = document.getElementById('folder-selector');
const chooseFolderBtn = document.getElementById('choose-folder-btn');
const exportBtn = document.getElementById('export-btn');
const exportAllBtn = document.getElementById('export-all-btn');

function setExportEnabled(enabled) {
  exportBtn.classList.toggle('export-btn--disabled', !enabled);
  exportBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  exportAllBtn.classList.toggle('export-btn--disabled', !enabled);
  exportAllBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function slugifyForFilename(title) {
  return (title || 'conversa')
    .trim()
    .slice(0, 50)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'conversa';
}

function waitForTabComplete(tabId) {
  return new Promise(function (resolve) {
    const listener = function (id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function shakeFolderSelector() {
  folderSelectorEl.classList.remove('shake');
  folderSelectorEl.offsetHeight;
  folderSelectorEl.classList.add('shake');
  setTimeout(function () {
    folderSelectorEl.classList.remove('shake');
  }, 450);
}

chooseFolderBtn.addEventListener('click', async function () {
  if (typeof window.showDirectoryPicker !== 'function') {
    statusEl.textContent = 'Seu navegador não suporta escolher pasta.';
    statusEl.className = 'status status-error';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    folderHandle = handle;
    folderLabel.textContent = handle.name;
    setExportEnabled(true);
    statusEl.textContent = 'Pasta escolhida. Clique em Exportar.';
    statusEl.className = 'status';
  } catch (err) {
    if (err.name !== 'AbortError') {
      statusEl.textContent = 'Erro ao escolher pasta.';
      statusEl.className = 'status status-error';
    }
  }
});

exportBtn.addEventListener('click', function () {
  if (!folderHandle) {
    shakeFolderSelector();
    statusEl.textContent = 'Escolha uma pasta primeiro.';
    statusEl.className = 'status status-error';
    return;
  }

  statusEl.textContent = 'Exportando...';
  statusEl.className = 'status';

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = 'Nenhuma aba ativa.';
      statusEl.className = 'status status-error';
      return;
    }
    const url = (tab.url || '').toLowerCase();
    if (!url.includes('chat.openai.com') && !url.includes('chatgpt.com')) {
      statusEl.textContent = 'Abra chat.openai.com ou chatgpt.com em uma conversa.';
      statusEl.className = 'status status-error';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'doExport', returnContent: true }, async function (response) {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Recarregue a página do chat e tente de novo.';
        statusEl.className = 'status status-error';
        return;
      }
      if (!response || !response.success || !response.markdown || !response.filename) {
        statusEl.textContent = (response && response.error) || 'Nenhuma mensagem encontrada.';
        statusEl.className = 'status status-error';
        return;
      }

      try {
        const fileHandle = await folderHandle.getFileHandle(response.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(response.markdown);
        await writable.close();
        statusEl.textContent = 'Exportado!';
        statusEl.className = 'status status-success';
      } catch (err) {
        statusEl.textContent = 'Erro ao salvar arquivo. Pasta pode ter sido removida.';
        statusEl.className = 'status status-error';
      }
    });
  });
});

exportAllBtn.addEventListener('click', function () {
  if (!folderHandle) {
    shakeFolderSelector();
    statusEl.textContent = 'Escolha uma pasta primeiro.';
    statusEl.className = 'status status-error';
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = 'Nenhuma aba ativa.';
      statusEl.className = 'status status-error';
      return;
    }
    const tabUrl = (tab.url || '').toLowerCase();
    if (!tabUrl.includes('chat.openai.com') && !tabUrl.includes('chatgpt.com')) {
      statusEl.textContent = 'Abra chat.openai.com ou chatgpt.com.';
      statusEl.className = 'status status-error';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getConversationList' }, async function (listResponse) {
      if (chrome.runtime.lastError || !listResponse || !listResponse.success) {
        statusEl.textContent = 'Nenhuma conversa encontrada na barra lateral.';
        statusEl.className = 'status status-error';
        return;
      }
      const conversations = listResponse.conversations || [];
      if (!conversations.length) {
        statusEl.textContent = 'Nenhuma conversa encontrada na barra lateral.';
        statusEl.className = 'status status-error';
        return;
      }

      const total = conversations.length;
      let exported = 0;

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        statusEl.textContent = 'Exportando ' + (i + 1) + ' de ' + total + '...';
        statusEl.className = 'status';

        try {
          chrome.tabs.update(tab.id, { url: conv.url });
          await waitForTabComplete(tab.id);
          await new Promise(function (r) { setTimeout(r, 1500); });

          const exportResponse = await new Promise(function (resolve) {
            chrome.tabs.sendMessage(tab.id, { action: 'doExport', returnContent: true }, function (res) {
              if (chrome.runtime.lastError) resolve(null);
              else resolve(res);
            });
          });

          if (exportResponse && exportResponse.success && exportResponse.markdown) {
            const idPart = (exportResponse.conversationId || String(i)).slice(0, 8);
            const safeName = slugifyForFilename(conv.title) + '-' + idPart + '.md';
            const fileHandle = await folderHandle.getFileHandle(safeName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(exportResponse.markdown);
            await writable.close();
            exported++;
          }
        } catch (err) {
          console.error('Export failed for', conv.title, err);
        }
      }

      statusEl.textContent = 'Exportadas ' + exported + ' conversas.';
      statusEl.className = 'status status-success';
    });
  });
});

setExportEnabled(false);
