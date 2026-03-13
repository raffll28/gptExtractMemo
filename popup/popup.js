const DB_NAME = 'gptextract-db';
const DB_STORE = 'store';
const FOLDER_KEY = 'folderHandle';
const STORAGE_EXTRACTED_IDS = 'extractedConversationIds';

let folderHandle = null;

const statusEl = document.getElementById('status');
const folderLabel = document.getElementById('folder-label');
const folderSelectorEl = document.getElementById('folder-selector');
const chooseFolderBtn = document.getElementById('choose-folder-btn');
const exportBtn = document.getElementById('export-btn');
const exportAllBtn = document.getElementById('export-all-btn');
const skipExportedCb = document.getElementById('skip-exported-cb');

function openDB() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = function () { reject(req.error); };
    req.onsuccess = function () { resolve(req.result); };
    req.onupgradeneeded = function (e) {
      e.target.result.createObjectStore(DB_STORE);
    };
  });
}

function getStoredFolderHandle() {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(FOLDER_KEY);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(req.result); };
    });
  });
}

function setStoredFolderHandle(handle) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const req = tx.objectStore(DB_STORE).put(handle, FOLDER_KEY);
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () { resolve(); };
    });
  });
}

function getExtractedIds() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(STORAGE_EXTRACTED_IDS, function (data) {
      resolve(Array.isArray(data[STORAGE_EXTRACTED_IDS]) ? data[STORAGE_EXTRACTED_IDS] : []);
    });
  });
}

function addExtractedId(id) {
  if (!id) return Promise.resolve();
  return getExtractedIds().then(function (ids) {
    if (ids.indexOf(id) >= 0) return;
    ids.push(id);
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [STORAGE_EXTRACTED_IDS]: ids }, resolve);
    });
  });
}

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

const EXPORT_READY_DELAY_MS = 800;
const EXPORT_READY_MAX_ATTEMPTS = 15;

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

function delay(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
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
    try {
      await setStoredFolderHandle(handle);
    } catch (e) {
      console.warn('Could not persist folder to IndexedDB', e);
    }
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
        if (response.conversationId) {
          addExtractedId(response.conversationId).catch(function () {});
        }
        statusEl.textContent = 'Exportado!';
        statusEl.className = 'status status-success';
      } catch (err) {
        statusEl.textContent = 'Erro ao salvar arquivo. Pasta pode ter sido removida.';
        statusEl.className = 'status status-error';
      }
    });
  });
});

exportAllBtn.addEventListener('click', async function () {
  if (!folderHandle) {
    shakeFolderSelector();
    statusEl.textContent = 'Escolha uma pasta primeiro.';
    statusEl.className = 'status status-error';
    return;
  }

  const skipExported = skipExportedCb && skipExportedCb.checked;
  const extractedIds = skipExported ? await getExtractedIds() : [];

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

      let conversationsToExport = listResponse.conversations || [];
      if (skipExported && extractedIds.length) {
        conversationsToExport = conversationsToExport.filter(function (c) {
          const id = (c.url || '').split('/c/').pop().split('/')[0].split('?')[0];
          return id && extractedIds.indexOf(id) < 0;
        });
      }
      if (!conversationsToExport.length) {
        statusEl.textContent = skipExported ? 'Nenhuma conversa nova para exportar.' : 'Nenhuma conversa encontrada na barra lateral.';
        statusEl.className = 'status status-error';
        return;
      }

      const total = conversationsToExport.length;
      statusEl.textContent = total + ' conversas para exportar. Iniciando...';
      statusEl.className = 'status';

      let exported = 0;

      for (let i = 0; i < conversationsToExport.length; i++) {
        const conv = conversationsToExport[i];
        statusEl.textContent = 'Exportando ' + (i + 1) + ' de ' + total + '...';
        statusEl.className = 'status';

        try {
          chrome.tabs.update(tab.id, { url: conv.url });
          await waitForTabComplete(tab.id);

          let exportResponse = null;
          for (let attempt = 0; attempt < EXPORT_READY_MAX_ATTEMPTS; attempt++) {
            exportResponse = await new Promise(function (resolve) {
              chrome.tabs.sendMessage(tab.id, { action: 'doExport', returnContent: true }, function (res) {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(res);
              });
            });
            if (exportResponse && exportResponse.success && exportResponse.markdown) {
              break;
            }
            await delay(EXPORT_READY_DELAY_MS);
          }

          if (exportResponse && exportResponse.success && exportResponse.markdown) {
            const idPart = (exportResponse.conversationId || String(i)).slice(0, 8);
            const safeName = slugifyForFilename(conv.title) + '-' + idPart + '.md';
            const fileHandle = await folderHandle.getFileHandle(safeName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(exportResponse.markdown);
            await writable.close();
            if (exportResponse.conversationId) {
              addExtractedId(exportResponse.conversationId).catch(function () {});
            }
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

function restoreSavedFolder() {
  getStoredFolderHandle()
    .then(function (handle) {
      if (!handle || typeof handle.queryPermission !== 'function') return;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (result) {
        if (result === 'granted') {
          folderHandle = handle;
          folderLabel.textContent = handle.name;
          setExportEnabled(true);
          statusEl.textContent = 'Pasta restaurada. Clique em Exportar.';
          statusEl.className = 'status';
        }
      });
    })
    .catch(function () {});
}

setExportEnabled(false);
restoreSavedFolder();
