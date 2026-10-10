// Git-Pass Interactive Engine

// 1. Toast Notification system
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-msg pointer-events-auto px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 backdrop-blur-md ${
    type === 'success' 
      ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-300' 
      : 'bg-slate-900/95 border-red-500/50 text-red-300'
  }`;

  toast.innerHTML = `
    <svg class="w-4 h-4 shrink-0 ${type === 'success' ? 'text-emerald-400' : 'text-red-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}"/>
    </svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

// 2. Clipboard helper
function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(successMsg))
      .catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    showToast('Failed to copy', 'error');
  }
  document.body.removeChild(textArea);
}

// 3. Password visibility toggles
function togglePasswordVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function togglePasswordCard(itemId) {
  const span = document.getElementById(`pwd-val-${itemId}`);
  const icon = document.getElementById(`eye-icon-${itemId}`);
  if (!span) return;

  const realPassword = span.getAttribute('data-password');
  const isMasked = span.innerText.includes('•');

  if (isMasked) {
    span.innerText = realPassword;
    span.classList.remove('password-masked');
    if (icon) {
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>`;
    }
  } else {
    span.innerText = '••••••••••••';
    span.classList.add('password-masked');
    if (icon) {
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
    }
  }
}

// 4. Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    if (modalId === 'generatorModal') {
      generatePasswordModal();
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
  }
});

// Close when clicking modal backdrop
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden');
  }
});

// 5. Client-Side Cryptographic Password Generation
function generatePasswordLocally(length = 18, useSymbols = true, useDigits = true) {
  let charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (useDigits) charset += "0123456789";
  if (useSymbols) charset += "!@#$%^&*()-_=+[]{}|;:,.<>?";

  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length];
  }
  return result;
}

function generatePasswordModal() {
  const length = parseInt(document.getElementById('genLength')?.value || '18', 10);
  const useSymbols = document.getElementById('genSymbols')?.checked ?? true;
  const useDigits = document.getElementById('genDigits')?.checked ?? true;

  const pwd = generatePasswordLocally(length, useSymbols, useDigits);
  const display = document.getElementById('genDisplay');
  if (display) {
    display.innerText = pwd;
    display.setAttribute('data-password', pwd);
  }
}

function copyGeneratedPassword() {
  const display = document.getElementById('genDisplay');
  if (display) {
    const pwd = display.getAttribute('data-password') || display.innerText;
    copyToClipboard(pwd, 'Generated password copied!');
  }
}

function generateAndFillPassword(targetFieldId) {
  const pwd = generatePasswordLocally(18, true, true);
  // Try directly or fallback to id_password
  let field = document.getElementById(targetFieldId);
  if (!field) {
    field = document.getElementById('id_password') || document.getElementById('item-password-field');
  }
  if (field) {
    field.value = pwd;
    field.type = 'text';
    showToast('Generated strong password!');
  }
}

// 6. Real-time Live Vault Search Filter
function clearSearchFilter() {
  const searchInput = document.getElementById('vaultSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
  if (clearBtn) {
    clearBtn.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('vaultSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const cards = document.querySelectorAll('.vault-card');
  const noResults = document.getElementById('noSearchResults');

  if (searchInput && cards.length > 0) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      let matchCount = 0;

      if (clearBtn) {
        if (q.length > 0) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
        }
      }

      cards.forEach(card => {
        const text = card.getAttribute('data-search') || '';
        if (!q || text.includes(q)) {
          card.style.display = 'flex';
          matchCount++;
        } else {
          card.style.display = 'none';
        }
      });

      if (noResults) {
        if (matchCount === 0 && q.length > 0) {
          noResults.classList.remove('hidden');
        } else {
          noResults.classList.add('hidden');
        }
      }
    });
  }
});
