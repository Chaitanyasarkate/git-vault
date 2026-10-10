// Git-Vault Interactive Engine

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

// 2. Secure Clipboard Handling with 30s Auto-Clear
let _clipboardClearTimer = null;

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (!text) return;
  const onCopied = () => {
    showToast(`${successMsg} (Auto-clears in 30s)`);
    if (_clipboardClearTimer) clearTimeout(_clipboardClearTimer);
    _clipboardClearTimer = setTimeout(() => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText('').catch(() => {});
      }
      showToast('Clipboard cleared for security.');
    }, 30000);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(onCopied)
      .catch(() => fallbackCopy(text, onCopied));
  } else {
    fallbackCopy(text, onCopied);
  }
}

function fallbackCopy(text, onCopied) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (typeof onCopied === 'function') onCopied();
    else showToast('Copied to clipboard');
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

    // Keyboard shortcut to focus search bar (/ or Ctrl+K / Cmd+K)
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k') || (e.metaKey && e.key.toLowerCase() === 'k')) && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  // Initialize live TOTP rolling timers
  initTotpLiveTimers();
});

// =========================================================================
// 7. Built-in 2FA / TOTP Live Countdown & Refresh Engine
// =========================================================================
function copyTotpCode(itemId) {
  const codeEl = document.getElementById(`totp-code-${itemId}`);
  if (codeEl) {
    const raw = codeEl.innerText.replace(/\s+/g, '');
    if (raw && raw !== '------') {
      copyToClipboard(raw, '2FA Authenticator code copied!');
    }
  }
}

function initTotpLiveTimers() {
  const totpBoxes = document.querySelectorAll('.totp-auth-box');
  if (totpBoxes.length === 0) return;

  function updateTimers() {
    const now = Math.floor(Date.now() / 1000);
    const timeStep = 30;
    const remaining = timeStep - (now % timeStep);
    const strokeDash = ((30 - remaining) / 30) * 100;

    totpBoxes.forEach(box => {
      const itemId = box.id.replace('totp-box-', '');
      const secEl = document.getElementById(`totp-sec-${itemId}`);
      const ringEl = document.getElementById(`totp-ring-${itemId}`);

      if (secEl) secEl.innerText = remaining;
      if (ringEl) {
        ringEl.setAttribute('stroke-dasharray', `${100 - strokeDash}, 100`);
        // Color transition when running low
        if (remaining <= 5) {
          ringEl.style.stroke = '#ef4444';
        } else if (remaining <= 10) {
          ringEl.style.stroke = '#f59e0b';
        } else {
          ringEl.style.stroke = '#10b981';
        }
      }
    });

    // When the 30-second window resets, fetch the fresh codes
    if (remaining === 30) {
      refreshAllTotpCodes();
    }
  }

  setInterval(updateTimers, 1000);
  updateTimers();
}

function refreshAllTotpCodes() {
  const totpBoxes = document.querySelectorAll('.totp-auth-box');
  totpBoxes.forEach(box => {
    const itemId = box.id.replace('totp-box-', '');
    const secret = box.getAttribute('data-totp-secret');
    if (!secret) return;

    fetch(`/api/totp-code/?secret=${encodeURIComponent(secret)}&item_id=${encodeURIComponent(itemId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.code) {
          const codeEl = document.getElementById(`totp-code-${itemId}`);
          if (codeEl) {
            codeEl.innerText = `${data.code.slice(0, 3)} ${data.code.slice(3)}`;
          }
        }
      })
      .catch(() => {});
  });
}

// =========================================================================
// 8. Breach Health Audit & Password Strength Dashboard
// =========================================================================
function openSecurityAuditModal() {
  openModal('auditModal');
  loadSecurityAudit(false); // First quick load, then user can click deep check
}

function loadSecurityAudit(deepCheck = false) {
  const statusEl = document.getElementById('auditStatusText');
  const deepBtn = document.getElementById('runDeepAuditBtn');
  if (statusEl) statusEl.innerText = deepCheck ? 'Running k-Anonymity breach audit against HaveIBeenPwned...' : 'Evaluating password strength and reuse...';
  if (deepBtn && deepCheck) {
    deepBtn.disabled = true;
    deepBtn.classList.add('opacity-50');
  }

  fetch(`/api/audit-vault/?check_breaches=${deepCheck ? 'true' : 'false'}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, 'error');
        return;
      }
      renderAuditResults(data);
      if (statusEl) {
        statusEl.innerText = deepCheck ? 'Deep breach audit completed!' : 'Local strength analysis ready. Click below for deep breach verification.';
      }
    })
    .catch(err => {
      if (statusEl) statusEl.innerText = 'Audit check failed.';
      showToast('Error checking vault security', 'error');
    })
    .finally(() => {
      if (deepBtn) {
        deepBtn.disabled = false;
        deepBtn.classList.remove('opacity-50');
      }
    });
}

function renderAuditResults(data) {
  // Update Gauge & Grade
  const score = data.health_score ?? 100;
  const grade = data.grade ?? 'A+';
  const scoreValEl = document.getElementById('auditGaugeScoreVal');
  const gradeEl = document.getElementById('auditGaugeGradeVal');
  const circleEl = document.getElementById('auditGaugeCircle');
  const pillScoreEl = document.getElementById('auditScorePill');

  if (scoreValEl) scoreValEl.innerText = `${score}%`;
  if (gradeEl) gradeEl.innerText = grade;
  if (pillScoreEl) pillScoreEl.innerText = `${score}%`;

  if (circleEl) {
    // 2 * PI * r = 2 * 3.14159 * 58 ≈ 364.4
    const circumference = 364.4;
    const offset = circumference - (score / 100) * circumference;
    circleEl.style.strokeDasharray = `${circumference}`;
    circleEl.style.strokeDashoffset = `${offset}`;
    if (score >= 80) circleEl.style.stroke = '#10b981';
    else if (score >= 60) circleEl.style.stroke = '#14b8a6';
    else if (score >= 40) circleEl.style.stroke = '#f59e0b';
    else circleEl.style.stroke = '#ef4444';
  }

  // Update Metric Cards
  const totalEl = document.getElementById('auditTotalCount');
  const breachedEl = document.getElementById('auditBreachedCount');
  const weakEl = document.getElementById('auditWeakCount');
  const reusedEl = document.getElementById('auditReusedCount');

  if (totalEl) totalEl.innerText = data.total_count ?? 0;
  if (breachedEl) breachedEl.innerText = data.breached_count ?? 0;
  if (weakEl) weakEl.innerText = data.weak_count ?? 0;
  if (reusedEl) reusedEl.innerText = data.reused_count ?? 0;

  // Render Items Breakdown
  const listEl = document.getElementById('auditItemsList');
  if (listEl && Array.isArray(data.items_audit)) {
    if (data.items_audit.length === 0) {
      listEl.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs">No credentials in vault.</div>';
      return;
    }

    listEl.innerHTML = data.items_audit.map(item => {
      const isBreached = item.breach_count > 0;
      const isWeak = item.strength?.score < 60;
      const isReused = item.is_reused;

      let badgeHtml = '';
      if (isBreached) {
        badgeHtml += `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/60 text-red-300 border border-red-500/40">⚠️ Breached (${item.breach_count.toLocaleString()}x)</span> `;
      }
      if (isReused) {
        badgeHtml += `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-900/60 text-amber-300 border border-amber-500/40">Reused</span> `;
      }
      if (isWeak) {
        badgeHtml += `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-900/60 text-orange-300 border border-orange-500/40">${item.strength?.label || 'Weak'}</span> `;
      }
      if (!isBreached && !isReused && !isWeak) {
        badgeHtml += `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-500/40">Secure</span>`;
      }

      return `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs gap-3">
          <div class="overflow-hidden">
            <div class="font-bold text-white truncate">${item.title} <span class="text-slate-400 font-normal">(${item.username})</span></div>
            <div class="mt-1 flex flex-wrap gap-1">${badgeHtml}</div>
          </div>
          <a href="/vault/edit/${item.id}/" class="btn-vault-secondary shrink-0 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
            Fix / Edit
          </a>
        </div>
      `;
    }).join('');
  }
}

// =========================================================================
// 9. Commit Time-Machine & Rollback Engine
// =========================================================================
let activeTimeMachineCommit = null;

function openTimeMachineModal() {
  openModal('timeMachineModal');
  loadTimeMachineCommits();
}

function loadTimeMachineCommits() {
  const container = document.getElementById('timeMachineList');
  const previewBox = document.getElementById('commitPreviewContainer');
  const restoreBtn = document.getElementById('restoreCommitBtn');

  if (container) container.innerHTML = '<div class="text-center text-slate-400 py-6 text-xs animate-pulse">Loading historical Git commits from repository...</div>';
  if (previewBox) previewBox.classList.add('hidden');
  if (restoreBtn) restoreBtn.disabled = true;

  fetch('/api/time-machine/commits/')
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<div class="text-center text-red-400 py-4 text-xs">${data.error}</div>`;
        return;
      }
      const commits = data.commits || [];
      if (commits.length === 0) {
        container.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs">No previous commits found for passwords file.</div>';
        return;
      }

      container.innerHTML = commits.map((c, idx) => `
        <div class="timeline-commit-card ${idx === 0 ? 'active' : ''}" id="commit-card-${c.short_sha}" onclick="selectCommitSnapshot('${c.sha}', '${c.short_sha}', '${escapeHtml(c.message)}')">
          <div class="overflow-hidden">
            <div class="text-xs font-bold text-white truncate flex items-center gap-1.5">
              <span class="font-mono text-cyan-400 text-[11px] px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/50">${c.short_sha}</span>
              <span class="truncate">${c.message}</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-1">
              By ${c.author} • ${formatCommitDate(c.date)}
            </div>
          </div>
          <button type="button" class="btn-vault-secondary px-2 py-1 text-[11px] text-cyan-300">
            Inspect
          </button>
        </div>
      `).join('');

      // Auto-select the first commit
      if (commits.length > 0) {
        selectCommitSnapshot(commits[0].sha, commits[0].short_sha, commits[0].message);
      }
    })
    .catch(() => {
      if (container) container.innerHTML = '<div class="text-center text-red-400 py-4 text-xs">Failed to load Git history.</div>';
    });
}

function selectCommitSnapshot(sha, shortSha, message) {
  activeTimeMachineCommit = sha;
  document.querySelectorAll('.timeline-commit-card').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`commit-card-${shortSha}`);
  if (activeEl) activeEl.classList.add('active');

  const previewBox = document.getElementById('commitPreviewContainer');
  const previewItemsList = document.getElementById('commitPreviewItems');
  const previewMeta = document.getElementById('commitPreviewMeta');
  const restoreBtn = document.getElementById('restoreCommitBtn');

  if (previewBox) previewBox.classList.remove('hidden');
  if (previewMeta) previewMeta.innerText = `Commit ${shortSha}: "${message}"`;
  if (previewItemsList) previewItemsList.innerHTML = '<div class="text-slate-400 text-xs py-2">Decrypting snapshot ciphertext...</div>';
  if (restoreBtn) {
    restoreBtn.disabled = false;
    restoreBtn.innerText = `Restore Version ${shortSha}`;
  }

  fetch(`/api/time-machine/preview/?commit_sha=${encodeURIComponent(sha)}`)
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        if (previewItemsList) previewItemsList.innerHTML = `<div class="text-red-400 text-xs py-2">${data.error || 'Failed to decrypt.'}</div>`;
        return;
      }
      const items = data.items || [];
      if (items.length === 0) {
        if (previewItemsList) previewItemsList.innerHTML = '<div class="text-slate-400 text-xs py-2">Vault was empty at this commit.</div>';
        return;
      }
      if (previewItemsList) {
        previewItemsList.innerHTML = `
          <div class="text-[11px] font-bold text-slate-300 mb-1.5">${items.length} credentials in this snapshot:</div>
          <div class="space-y-1">
            ${items.map(it => `
              <div class="flex items-center justify-between text-xs py-1 border-b border-slate-800/80">
                <span class="font-semibold text-white">${it.title}</span>
                <span class="text-slate-400 font-mono text-[11px]">${it.username || '-'}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    })
    .catch(() => {
      if (previewItemsList) previewItemsList.innerHTML = '<div class="text-red-400 text-xs py-2">Preview error.</div>';
    });
}

function rollbackToCommit() {
  if (!activeTimeMachineCommit) return;
  const shortSha = activeTimeMachineCommit.slice(0, 7);
  if (!confirm(`Are you sure you want to ROLLBACK your vault to commit ${shortSha}?\n\nThis will restore all passwords from that historical snapshot and push a new Git commit to your repository.`)) {
    return;
  }

  const restoreBtn = document.getElementById('restoreCommitBtn');
  if (restoreBtn) {
    restoreBtn.disabled = true;
    restoreBtn.innerText = 'Restoring snapshot...';
  }

  const csrfToken = getCookie('csrftoken');
  const formData = new FormData();
  formData.append('commit_sha', activeTimeMachineCommit);

  fetch('/api/time-machine/rollback/', {
    method: 'POST',
    headers: {
      'X-CSRFToken': csrfToken,
    },
    body: formData,
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast(data.message || 'Vault restored successfully!');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showToast(data.error || 'Rollback failed', 'error');
        if (restoreBtn) {
          restoreBtn.disabled = false;
          restoreBtn.innerText = `Restore Version ${shortSha}`;
        }
      }
    })
    .catch(() => {
      showToast('Network error during rollback', 'error');
      if (restoreBtn) {
        restoreBtn.disabled = false;
        restoreBtn.innerText = `Restore Version ${shortSha}`;
      }
    });
}

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

function formatCommitDate(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr.slice(0, 10);
  }
}

// ==========================================
// PWA Install Prompt Handler
// ==========================================
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        const { outcome } = await deferredPwaPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Git-Vault installed as desktop/mobile app!');
        }
        deferredPwaPrompt = null;
        installBtn.style.display = 'none';
      } else {
        showToast('App is already installed or install prompt not triggered yet.');
      }
    });
  }

  // ==========================================
  // Power-User Daily Keyboard Shortcuts
  // ==========================================
  document.addEventListener('keydown', (e) => {
    const targetTag = e.target.tagName.toLowerCase();
    const isEditing = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';

    // Press '/' to instantly jump to search
    if (e.key === '/' && !isEditing) {
      e.preventDefault();
      const searchInput = document.getElementById('vaultSearchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // Press 'Esc' to close any open modal
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-backdrop:not(.hidden)');
      openModals.forEach((m) => {
        m.classList.add('hidden');
        document.body.style.overflow = '';
      });
      // Also close options dropdown if open
      const dropdown = document.querySelector('.dropdown-container.open');
      if (dropdown) dropdown.classList.remove('open');
    }

    // Press Alt + N or Ctrl + Shift + N to open Add Credential modal
    if ((e.altKey && (e.key === 'n' || e.key === 'N')) || (e.ctrlKey && e.shiftKey && (e.key === 'n' || e.key === 'N'))) {
      e.preventDefault();
      openModal('addModal');
    }
  });

  // ==========================================
  // Automatic Lock & Inactivity Timeout (15 min)
  // ==========================================
  (function initInactivityLock() {
    const isAuth = !!document.querySelector('.user-repo-badge');
    if (!isAuth) return;

    let idleSeconds = 0;
    const maxIdle = 15 * 60; // 15 minutes
    const warnAt = 14 * 60;  // 14 minutes

    function resetIdle() {
      idleSeconds = 0;
    }

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, resetIdle, { passive: true });
    });

    setInterval(() => {
      idleSeconds += 1;
      if (idleSeconds === warnAt) {
        showToast('⚠️ Inactivity detected. Locking vault in 60 seconds.', 'error');
      } else if (idleSeconds >= maxIdle) {
        window.location.href = '/logout/';
      }
    }, 1000);
  })();
});

// ==========================================
// Sorting, Cloud Sync & Wi-Fi QR Helpers
// ==========================================
function updateSortFilter(sortVal) {
  const url = new URL(window.location.href);
  url.searchParams.set('sort', sortVal);
  window.location.href = url.toString();
}

async function triggerCloudSync() {
  const btn = document.getElementById('btnCloudSync');
  const icon = document.getElementById('cloudSyncIcon');
  if (icon) icon.classList.add('animate-spin');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/cloud-sync/');
    const data = await res.json();
    if (data.synced) {
      showToast(data.message || 'Synced with GitHub cloud!');
      if (data.updated) {
        setTimeout(() => window.location.reload(), 700);
      }
    } else {
      showToast(data.error || 'Cloud sync failed', 'error');
    }
  } catch (err) {
    showToast('Sync network error: ' + err.message, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (btn) btn.disabled = false;
  }
}

function showWifiQrModal(ssid, password) {
  const title = document.getElementById('wifiModalTitle');
  const ssidEl = document.getElementById('wifiModalSsid');
  const img = document.getElementById('wifiQrImage');

  if (title) title.textContent = `Wi-Fi: ${ssid}`;
  if (ssidEl) ssidEl.textContent = `SSID: ${ssid} | Key: ${password}`;

  // Standard Wi-Fi URI format for QR codes: WIFI:S:<SSID>;T:WPA;P:<password>;;
  const wifiPayload = `WIFI:S:${ssid};T:WPA;P:${password};;`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(wifiPayload)}`;
  if (img) img.src = qrUrl;

  openModal('wifiModal');
}


