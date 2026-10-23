/**
 * Git-Vault Content Script
 * 1. 1-Click Credential Autofill
 * 2. Intelligent Auto-Capture for Form Submissions
 */

// 1. Autofill Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FILL_CREDENTIALS' || request.action === 'AUTOFILL_CREDENTIAL') {
    const { username, password } = request;
    const success = fillForm(username, password);
    sendResponse({ success: success !== false });
  }
  return true;
});

function setInputValue(element, value) {
  if (!element) return;
  element.focus();
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillForm(username, password) {
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(el => {
    return el.offsetParent !== null && !el.disabled && !el.readOnly;
  });

  const usernameSelector = 'input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[id*="user" i], input[id*="email" i], input[id*="login" i], input[type="text"]';

  if (passwordInputs.length > 0) {
    const pwdInput = passwordInputs[0];
    if (password) setInputValue(pwdInput, password);

    // Find corresponding username input in same form or document
    const form = pwdInput.closest('form');
    let userInput = null;
    if (form) {
      userInput = form.querySelector(usernameSelector);
    }
    if (!userInput) {
      const allUsers = Array.from(document.querySelectorAll(usernameSelector)).filter(el => el.offsetParent !== null && !el.disabled && !el.readOnly);
      if (allUsers.length > 0) userInput = allUsers[0];
    }

    if (userInput && username) {
      setInputValue(userInput, username);
    }
    return true;
  } else {
    // Check if there is a standalone username input (e.g. step 1 of 2-step login)
    const allUsers = Array.from(document.querySelectorAll(usernameSelector)).filter(el => el.offsetParent !== null && !el.disabled && !el.readOnly);
    if (allUsers.length > 0 && username) {
      setInputValue(allUsers[0], username);
      return true;
    }
  }
  return false;
}

// 2. Git-Vault Web App Bridge (for git-vault-theta.vercel.app, git-vault.onrender.com & localhost)
const currentHost = window.location.hostname.toLowerCase();
const isGitVaultSite = currentHost.includes('git-vault-theta.vercel.app') ||
  currentHost.includes('git-vault.onrender.com') ||
  (currentHost.includes('vercel.app') && (document.title.includes('Git-Vault') || document.title.includes('Password Vault') || document.querySelector('meta[name="apple-mobile-web-app-title"]'))) ||
  (currentHost === 'localhost' || currentHost === '127.0.0.1') && (document.title.includes('Git-Vault') || document.querySelector('meta[name="apple-mobile-web-app-title"]'));

if (isGitVaultSite) {
  document.documentElement.setAttribute('data-gitvault-extension-installed', 'true');
  window.dispatchEvent(new CustomEvent('GitVaultExtensionDetected', { detail: { version: '1.0.0' } }));

  // Listen for sync messages from git-vault.onrender.com
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'GITVAULT_SYNC_CONFIG_TO_EXTENSION') {
      const payload = event.data.payload || {};
      try {
        if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            gitpass_user: payload.username || '',
            gitpass_repo: payload.repo || '',
            gitpass_token: payload.token || '',
            gitpass_filename: payload.filename || 'passwords.txt',
            gitvault_web_url: window.location.origin
          }, () => {
            window.postMessage({ type: 'GITVAULT_CONFIG_SYNCED_ACK', success: true }, window.location.origin);
          });
        }
      } catch (err) {
        window.postMessage({ type: 'GITVAULT_CONFIG_SYNCED_ACK', success: false, error: err.message }, window.location.origin);
      }
    } else if (event.data && event.data.type === 'GITVAULT_CHECK_EXTENSION_STATUS') {
      window.postMessage({ type: 'GITVAULT_EXTENSION_STATUS_RESP', installed: true, version: '1.0.0' }, window.location.origin);
    }
  });
}

// 3. Intelligent Auto-Capture Engine
document.addEventListener('submit', handleFormSubmit, true);

function handleFormSubmit(event) {
  // Never auto-capture Git-Vault master password or GitHub token on Git-Vault itself
  if (isGitVaultSite) return;

  const form = event.target;
  if (!form || !form.querySelector) return;

  const pwdInput = form.querySelector('input[type="password"]');
  if (!pwdInput || !pwdInput.value) return;

  const password = pwdInput.value;
  let username = '';

  const userInput = form.querySelector('input[type="email"], input[autocomplete="username"], input[name*="user"], input[name*="email"], input[name*="login"], input[type="text"]');
  if (userInput && userInput.value) {
    username = userInput.value.trim();
  }

  if (!username) {
    // Check preceding text inputs
    const inputs = Array.from(form.querySelectorAll('input'));
    const pwdIndex = inputs.indexOf(pwdInput);
    if (pwdIndex > 0) {
      const prev = inputs[pwdIndex - 1];
      if (prev && prev.value && prev.type !== 'hidden') {
        username = prev.value.trim();
      }
    }
  }

  if (password && username) {
    const hostname = window.location.hostname.replace(/^www\./, '');
    const title = document.title ? document.title.split(/[-–|•]/)[0].trim() : hostname;

    showAutoCaptureBanner({
      title: title || hostname,
      username: username,
      password: password,
      url: window.location.origin
    });
  }
}


function showAutoCaptureBanner(cred) {
  // Prevent duplicate banners
  if (document.getElementById('gitpass-autocapture-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'gitpass-autocapture-banner';
  banner.style.cssText = `
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 2147483647;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(52, 211, 153, 0.4);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(52, 211, 153, 0.15);
    border-radius: 18px;
    padding: 14px 18px;
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    max-width: 320px;
    animation: gitpassSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  banner.innerHTML = `
    <style>
      @keyframes gitpassSlideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .gp-btn-save {
        background: #ffffff;
        color: #0b0c10;
        font-weight: 700;
        border: none;
        padding: 6px 14px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 12px;
        transition: transform 0.15s ease;
      }
      .gp-btn-save:hover {
        transform: scale(1.04);
      }
      .gp-btn-dismiss {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 6px 12px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 12px;
      }
      .gp-btn-dismiss:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
      }
    </style>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 7px; font-weight: 700; color: #34d399; font-size: 12px;">
        <span style="font-size: 15px;">🛡️</span> Git-Vault Auto-Capture
      </div>
      <button id="gp-close-x" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; padding: 0 4px;">&times;</button>
    </div>
    <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      Save login for ${escapeStr(cred.title)}?
    </div>
    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 12px; font-family: monospace;">
      ${escapeStr(cred.username)}
    </div>
    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
      <button id="gp-btn-dismiss" class="gp-btn-dismiss">Never</button>
      <button id="gp-btn-save" class="gp-btn-save">Save Password</button>
    </div>
  `;

  document.body.appendChild(banner);

  function removeBanner() {
    if (banner.parentNode) banner.parentNode.removeChild(banner);
  }

  document.getElementById('gp-close-x')?.addEventListener('click', removeBanner);
  document.getElementById('gp-btn-dismiss')?.addEventListener('click', removeBanner);

  document.getElementById('gp-btn-save')?.addEventListener('click', () => {
    // Send to extension storage
    try {
      chrome.storage.local.get(['gitvault_pending_captures', 'gitpass_pending_captures'], (res) => {
        const captures = res.gitvault_pending_captures || res.gitpass_pending_captures || [];
        captures.push(cred);
        chrome.storage.local.set({ gitvault_pending_captures: captures, gitpass_pending_captures: captures }, () => {
          banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #34d399; font-weight: 700; padding: 6px 0;">
              <span>✓</span> Saved to Git-Vault queue!
            </div>
          `;
          setTimeout(removeBanner, 1800);
        });
      });
    } catch {
      removeBanner();
    }
  });

  // Auto-dismiss after 15 seconds
  setTimeout(removeBanner, 15000);
}

function escapeStr(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
