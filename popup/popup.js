const STORAGE_EXTRACTED_BY_FOLDER = 'extractedByFolder';

let folderHandle = null;

const statusEl = document.getElementById('status');
const folderPathInput = document.getElementById('folder-path-input');
const folderSelectorEl = document.getElementById('folder-selector');
const chooseFolderBtn = document.getElementById('choose-folder-btn');
const exportBtn = document.getElementById('export-btn');
const exportAllBtn = document.getElementById('export-all-btn');

function getExtractedIds(folderName) {
  var key = folderName || (folderHandle && folderHandle.name);
  if (!key) return Promise.resolve([]);
  return new Promise(function (resolve) {
    chrome.storage.local.get(STORAGE_EXTRACTED_BY_FOLDER, function (data) {
      var byFolder = data[STORAGE_EXTRACTED_BY_FOLDER];
      resolve(key && byFolder && Array.isArray(byFolder[key]) ? byFolder[key] : []);
    });
  });
}

function addExtractedId(id, folderName) {
  if (!id) return Promise.resolve();
  var key = folderName || (folderHandle && folderHandle.name);
  if (!key) return Promise.resolve();
  var idPart = String(id).slice(0, 8);
  return new Promise(function (resolve) {
    chrome.storage.local.get(STORAGE_EXTRACTED_BY_FOLDER, function (data) {
      var byFolder = data[STORAGE_EXTRACTED_BY_FOLDER] || {};
      if (!Array.isArray(byFolder[key])) byFolder[key] = [];
      if (byFolder[key].indexOf(idPart) >= 0) return resolve();
      byFolder[key].push(idPart);
      chrome.storage.local.set({ [STORAGE_EXTRACTED_BY_FOLDER]: byFolder }, resolve);
    });
  });
}

function listMdFileIdsInFolder(handle) {
  var ids = [];
  var it = handle.entries();
  function next() {
    return it.next().then(function (result) {
      if (result.done) return ids;
      var name = result.value[0];
      var entry = result.value[1];
      if (entry.kind === 'file' && name.toLowerCase().endsWith('.md')) {
        var idPart = (name.replace(/\.md$/i, '').split('-').pop() || '').slice(0, 8);
        if (idPart && /^[a-f0-9]{8}$/i.test(idPart)) ids.push(idPart);
      }
      return next();
    });
  }
  return next();
}

function syncFolderRegistry(handle) {
  if (!handle || !handle.name) return Promise.resolve();
  return listMdFileIdsInFolder(handle).then(function (ids) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [STORAGE_EXTRACTED_BY_FOLDER]: { [handle.name]: ids } }, resolve);
    });
  }).catch(function () {});
}

function setExportEnabled(enabled) {
  exportBtn.classList.toggle('export-btn--disabled', !enabled);
  exportBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  exportAllBtn.classList.toggle('export-btn--disabled', !enabled);
  exportAllBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function slugifyForFilename(title) {
  return (title || 'conversation')
    .trim()
    .slice(0, 50)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'conversation';
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
    statusEl.textContent = 'Your browser does not support choosing a folder.';
    statusEl.className = 'status status-error';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    folderHandle = handle;
    folderPathInput.value = handle.name || '';
    folderPathInput.title = handle.name || '';
    setExportEnabled(true);
    statusEl.textContent = 'Folder chosen. Click Extract.';
    statusEl.className = 'status';
    await syncFolderRegistry(handle);
  } catch (err) {
    if (err.name !== 'AbortError') {
      statusEl.textContent = 'Error choosing folder.';
      statusEl.className = 'status status-error';
    }
  }
});

exportBtn.addEventListener('click', function () {
  if (!folderHandle) {
    shakeFolderSelector();
    statusEl.textContent = 'Choose a folder first.';
    statusEl.className = 'status status-error';
    return;
  }

  statusEl.textContent = 'Extracting...';
  statusEl.className = 'status';

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = 'No active tab.';
      statusEl.className = 'status status-error';
      return;
    }
    const url = (tab.url || '').toLowerCase();
    if (!url.includes('chat.openai.com') && !url.includes('chatgpt.com')) {
      statusEl.textContent = 'Open chat.openai.com or chatgpt.com in a conversation.';
      statusEl.className = 'status status-error';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'doExport', returnContent: true }, async function (response) {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Reload the chat page and try again.';
        statusEl.className = 'status status-error';
        return;
      }
      if (!response || !response.success || !response.markdown || !response.filename) {
        statusEl.textContent = (response && response.error) || 'No messages found.';
        statusEl.className = 'status status-error';
        return;
      }

      try {
        const fileHandle = await folderHandle.getFileHandle(response.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(response.markdown);
        await writable.close();
        if (response.conversationId) {
          addExtractedId(response.conversationId, folderHandle.name).catch(function () {});
        }
        statusEl.textContent = 'Extracted!';
        statusEl.className = 'status status-success';
      } catch (err) {
        statusEl.textContent = 'Error saving file. Folder may have been removed.';
        statusEl.className = 'status status-error';
      }
    });
  });
});

exportAllBtn.addEventListener('click', async function () {
  if (!folderHandle) {
    shakeFolderSelector();
    statusEl.textContent = 'Choose a folder first.';
    statusEl.className = 'status status-error';
    return;
  }

  const extractedIds = folderHandle ? await getExtractedIds(folderHandle.name) : [];

  chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = 'No active tab.';
      statusEl.className = 'status status-error';
      return;
    }
    const tabUrl = (tab.url || '').toLowerCase();
    if (!tabUrl.includes('chat.openai.com') && !tabUrl.includes('chatgpt.com')) {
      statusEl.textContent = 'Open chat.openai.com or chatgpt.com.';
      statusEl.className = 'status status-error';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getConversationList' }, async function (listResponse) {
      if (chrome.runtime.lastError || !listResponse || !listResponse.success) {
        statusEl.textContent = 'No conversations found in the sidebar.';
        statusEl.className = 'status status-error';
        return;
      }

      let conversationsToExport = listResponse.conversations || [];
      if (extractedIds.length) {
        conversationsToExport = conversationsToExport.filter(function (c) {
          var rawId = (c.url || '').split('/c/').pop().split('/')[0].split('?')[0];
          var id8 = rawId ? String(rawId).slice(0, 8) : '';
          return id8 && extractedIds.indexOf(id8) < 0;
        });
      }
      if (!conversationsToExport.length) {
        statusEl.textContent = extractedIds.length ? 'No new conversations to export.' : 'No conversations found in the sidebar.';
        statusEl.className = 'status status-error';
        return;
      }

      const total = conversationsToExport.length;
      statusEl.textContent = total + ' conversations to export. Starting...';
      statusEl.className = 'status';

      let exported = 0;

      for (let i = 0; i < conversationsToExport.length; i++) {
        const conv = conversationsToExport[i];
        statusEl.textContent = 'Extracting ' + (i + 1) + ' of ' + total + '...';
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
              addExtractedId(exportResponse.conversationId, folderHandle.name).catch(function () {});
            }
            exported++;
          }
        } catch (err) {
          console.error('Export failed for', conv.title, err);
        }
      }

      statusEl.textContent = 'Extracted ' + exported + ' conversations.';
      statusEl.className = 'status status-success';
    });
  });
});

if (chrome.runtime && chrome.runtime.connect) {
  chrome.runtime.connect({ name: 'popup' });
}

setExportEnabled(false);
