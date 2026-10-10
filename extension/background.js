/**
 * Git-Vault WebExtension Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('Git-Vault Extension installed successfully.');
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ status: 'PONG' });
  }
  return true;
});
