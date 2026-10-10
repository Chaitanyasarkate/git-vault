/**
 * Git-Vault Content Script
 * 1. 1-Click Credential Autofill
 * 2. Intelligent Auto-Capture for Form Submissions
 */

// 1. Autofill Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FILL_CREDENTIALS') {
    const { username, password } = request;
    fillForm(username, password);
    sendResponse({ success: true });
  }
  return true;
});

function fillForm(username, password) {
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
  
  if (passwordInputs.length > 0) {
    const pwdInput = passwordInputs[0];
    pwdInput.value = password;
    pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
    pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Find corresponding username input
    const form = pwdInput.closest('form');
    let userInput = null;

    if (form) {
      userInput = form.querySelector('input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"], input[type="text"][name*="login"], input[type="text"][autocomplete*="username"]');
    }
    if (!userInput) {
      userInput = document.querySelector('input[type="email"], input[autocomplete="username"], input[name*="user"], input[name*="login"]');
    }

    if (userInput && username) {
      userInput.value = username;
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      userInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

// 2. Intelligent Auto-Capture Engine
document.addEventListener('submit', handleFormSubmit, true);

function handleFormSubmit(event) {
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
