let folderHandle = null;

const statusEl = document.getElementById('status');
const folderLabel = document.getElementById('folder-label');
const folderSelectorEl = document.getElementById('folder-selector');
const chooseFolderBtn = document.getElementById('choose-folder-btn');
const exportBtn = document.getElementById('export-btn');

function setExportEnabled(enabled) {
  exportBtn.classList.toggle('export-btn--disabled', !enabled);
  exportBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
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

setExportEnabled(false);
