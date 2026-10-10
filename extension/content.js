/**
 * Git-Vault Content Script
 * 1. 1-Click Credential Autofill Listener
 * 2. Google Password Manager-Style In-Field Auto-Suggest Dropdown
 * 3. Intelligent Auto-Capture for Form Submissions
 */

let activeDropdown = null;
let currentTargetInput = null;

// =========================================================================
// 1. Autofill Listener from Popup
// =========================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FILL_CREDENTIALS') {
    const { username, password } = request;
    fillForm(username, password);
    sendResponse({ success: true });
  }
  return true;
});

function fillForm(username, password, specificInput = null) {
  const form = specificInput ? specificInput.closest('form') : document.querySelector('form');
  const root = form || document;

  // 1. Password input
  let pwdInput = root.querySelector('input[type="password"]');
  if (!pwdInput && specificInput && specificInput.type === 'password') {
    pwdInput = specificInput;
  }
  if (pwdInput && password) {
    setInputValue(pwdInput, password);
  }

  // 2. Username input
  let userInput = null;
  if (form) {
    userInput = form.querySelector(
      'input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[type="text"][name*="login" i], input[type="text"][autocomplete*="username" i]'
    );
  }
  if (!userInput) {
    userInput = document.querySelector(
      'input[type="email"], input[autocomplete="username" i], input[name*="user" i], input[name*="login" i], input[name*="email" i]'
    );
  }
  if (!userInput && specificInput && specificInput.type !== 'password') {
    userInput = specificInput;
  }

  if (userInput && username) {
    setInputValue(userInput, username);
  }

  showInlineNotification(specificInput || pwdInput || userInput, '✓ Filled by Git-Vault');
}

function setInputValue(input, value) {
  if (!input) return;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

// =========================================================================
// 2. Google Password-Style In-Field Auto-Suggest Dropdown
// =========================================================================
function isEligibleInput(el) {
  if (!el || el.tagName !== 'INPUT') return false;
  const type = (el.type || 'text').toLowerCase();
  if (type === 'password') return true;
  if (type === 'email') return true;
  if (type === 'text') {
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    const ph = (el.placeholder || '').toLowerCase();
    return (
      auto.includes('username') ||
      auto.includes('email') ||
      name.includes('user') ||
      name.includes('login') ||
      name.includes('email') ||
      id.includes('user') ||
      id.includes('login') ||
      id.includes('email') ||
      ph.includes('user') ||
      ph.includes('email') ||
      ph.includes('login')
    );
  }
  return false;
}

function attachFieldListeners() {
  const inputs = document.querySelectorAll('input');
  inputs.forEach((input) => {
    if (isEligibleInput(input) && !input.dataset.gvAttached) {
      input.dataset.gvAttached = 'true';
      input.addEventListener('focus', onFieldFocus);
      input.addEventListener('click', onFieldFocus);
    }
  });
}

function onFieldFocus(e) {
  const input = e.target;
  currentTargetInput = input;

  chrome.storage.local.get(['gitvault_active_items', 'gitvault_is_unlocked'], (res) => {
    const isUnlocked = !!res.gitvault_is_unlocked;
    const items = res.gitvault_active_items || [];

    if (!isUnlocked || items.length === 0) {
      showLockedNotice(input);
      return;
    }

    // Match credentials against current domain
    const host = window.location.hostname.replace(/^www\./, '').toLowerCase();
    const sld = host.split('.')[0]; // e.g. "github" from "github.com"

    let matches = items.filter((item) => {
      const itemUrl = (item.url || '').toLowerCase();
      const itemTitle = (item.title || '').toLowerCase();
      return (
        itemUrl.includes(host) ||
        itemUrl.includes(sld) ||
        itemTitle.includes(host) ||
        itemTitle.includes(sld)
      );
    });

    // If no direct domain match, show all items
    if (matches.length === 0) {
      matches = items.slice(0, 4);
    }

    showSuggestDropdown(input, matches, host);
  });
}

function showSuggestDropdown(input, matches, host) {
  removeActiveDropdown();

  const rect = input.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.id = 'gitvault-suggest-dropdown';
  dropdown.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 6}px;
    left: ${Math.max(10, rect.left)}px;
    width: ${Math.max(260, Math.min(360, rect.width))}px;
    z-index: 2147483647;
    background: rgba(15, 17, 23, 0.96);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(52, 211, 153, 0.4);
    border-radius: 14px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.85), 0 0 20px rgba(52, 211, 153, 0.12);
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    overflow: hidden;
    animation: gvFadeDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  let itemsHtml = '';
  matches.forEach((item, idx) => {
    const initials = (item.title || 'AC').slice(0, 2).toUpperCase();
    itemsHtml += `
      <div class="gv-suggest-row" data-idx="${idx}" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; transition: background 0.15s; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.35); color: #34d399; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0;">
          ${escapeStr(initials)}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">
            ${escapeStr(item.title || host)}
          </div>
          <div style="font-size: 11px; color: #94a3b8; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeStr(item.username)}
          </div>
        </div>
        <div style="font-size: 10px; color: #34d399; font-weight: 600; padding: 3px 7px; background: rgba(52, 211, 153, 0.1); border-radius: 6px;">
          Fill
        </div>
      </div>
    `;
  });

  dropdown.innerHTML = `
    <style>
      @keyframes gvFadeDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .gv-suggest-row:hover {
        background: rgba(255, 255, 255, 0.08) !important;
      }
      .gv-gen-btn:hover {
        background: rgba(52, 211, 153, 0.15) !important;
        color: #34d399 !important;
      }
    </style>
    <!-- Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(255,255,255,0.08);">
      <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; color: #34d399;">
        <span style="font-size: 13px;">🛡️</span> Git-Vault Autocomplete
      </div>
      <button id="gv-close-suggest" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 15px; padding: 0 4px; line-height: 1;">&times;</button>
    </div>

    <!-- Items List -->
    <div style="max-height: 200px; overflow-y: auto;">
      ${itemsHtml}
    </div>

    <!-- Generator Footer -->
    <div id="gv-quick-gen" class="gv-gen-btn" style="display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06); cursor: pointer; color: #cbd5e1; font-weight: 500; font-size: 11px; transition: all 0.15s;">
      <span style="color: #34d399;">⚡</span>
      <span>Generate Strong Password</span>
    </div>
  `;

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  // Row Click Handlers
  dropdown.querySelectorAll('.gv-suggest-row').forEach((row) => {
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = parseInt(row.dataset.idx, 10);
      const chosen = matches[idx];
      if (chosen) {
        fillForm(chosen.username, chosen.password, input);
      }
      removeActiveDropdown();
    });
  });

  // Generator Click Handler
  dropdown.querySelector('#gv-quick-gen')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const strongPwd = generateQuickPassword(20);
    fillForm('', strongPwd, input);
    navigator.clipboard.writeText(strongPwd).catch(() => {});
    showInlineNotification(input, '⚡ Generated strong password & copied to clipboard!');
    removeActiveDropdown();
  });

  // Close Button
  dropdown.querySelector('#gv-close-suggest')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    removeActiveDropdown();
  });
}

function showLockedNotice(input) {
  removeActiveDropdown();

  const rect = input.getBoundingClientRect();
  const notice = document.createElement('div');
  notice.id = 'gitvault-suggest-dropdown';
  notice.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 6}px;
    left: ${Math.max(10, rect.left)}px;
    z-index: 2147483647;
    background: rgba(15, 17, 23, 0.94);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 11px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: gvFadeDown 0.18s ease;
  `;
  notice.innerHTML = `
    <span style="color: #fbbf24;">🔒</span>
    <span>Git-Vault is locked. Press <strong style="color: #34d399;">Alt + V</strong> to unlock.</span>
  `;

  document.body.appendChild(notice);
  activeDropdown = notice;

  setTimeout(removeActiveDropdown, 3500);
}

function removeActiveDropdown() {
  if (activeDropdown && activeDropdown.parentNode) {
    activeDropdown.parentNode.removeChild(activeDropdown);
  }
  activeDropdown = null;
}

function showInlineNotification(anchorInput, message) {
  if (!anchorInput) return;
  const rect = anchorInput.getBoundingClientRect();
  const pill = document.createElement('div');
  pill.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 6}px;
    left: ${Math.max(10, rect.left)}px;
    z-index: 2147483647;
    background: #064e3b;
    border: 1px solid #34d399;
    color: #a7f3d0;
    font-size: 11px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 6px 12px;
    border-radius: 20px;
    box-shadow: 0 10px 20px rgba(0,0,0,0.5);
    animation: gvFadeDown 0.2s ease;
  `;
  pill.textContent = message;
  document.body.appendChild(pill);
  setTimeout(() => {
    if (pill.parentNode) pill.parentNode.removeChild(pill);
  }, 2200);
}

function generateQuickPassword(length = 20) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[array[i] % chars.length];
  }
  return res;
}

// Global outside-click and escape listeners to dismiss dropdown
document.addEventListener('click', (e) => {
  if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== currentTargetInput) {
    removeActiveDropdown();
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    removeActiveDropdown();
  }
});

window.addEventListener('resize', removeActiveDropdown);
window.addEventListener('scroll', removeActiveDropdown, true);

// Init on page load and on dynamic DOM additions
attachFieldListeners();
const observer = new MutationObserver(attachFieldListeners);
observer.observe(document.body, { childList: true, subtree: true });

// =========================================================================
// 3. Intelligent Auto-Capture Engine
// =========================================================================
document.addEventListener('submit', handleFormSubmit, true);

function handleFormSubmit(event) {
  const form = event.target;
  if (!form || !form.querySelector) return;

  const pwdInput = form.querySelector('input[type="password"]');
  if (!pwdInput || !pwdInput.value) return;

  const password = pwdInput.value;
  let username = '';

  const userInput = form.querySelector(
    'input[type="email"], input[autocomplete="username" i], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[type="text"]'
  );
  if (userInput && userInput.value) {
    username = userInput.value.trim();
  }

  if (!username) {
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

  setTimeout(removeBanner, 15000);
}

function escapeStr(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
