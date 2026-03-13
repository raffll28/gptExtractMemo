chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'popup') return;
  port.onDisconnect.addListener(function () {
    chrome.storage.local.clear();
  });
});
