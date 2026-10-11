/**
 * Git-Vault WebExtension Popup Controller
 * Features:
 * - AES-256-GCM + PBKDF2 Zero-Knowledge Local Decryption
 * - WebAuthn Biometric Unlock (Touch ID, Windows Hello, Fingerprint)
 * - Built-in 2FA / TOTP Authenticator with Live Rolling Codes
 * - Browser Auto-Capture Sync Queue
 * - Password Generator & 1-Click Autofill
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const viewUnlock = document.getElementById('viewUnlock');
  const viewVault = document.getElementById('viewVault');
  const viewAdd = document.getElementById('viewAdd');
  const viewGenerator = document.getElementById('viewGenerator');
  
  const headerActions = document.getElementById('headerActions');
  const headerRepoTag = document.getElementById('headerRepoTag');
  const btnToggleBiometrics = document.getElementById('btnToggleBiometrics');
  const btnLockVault = document.getElementById('btnLockVault');
  const btnSyncExt = document.getElementById('btnSyncExt');
  const btnOpenWeb = document.getElementById('btnOpenWeb');
  const renderCloudBadge = document.getElementById('renderCloudBadge');
  const footerWebLink = document.getElementById('footerWebLink');
  
  const formUnlock = document.getElementById('formUnlock');
  const setupFields = document.getElementById('setupFields');
  const setupUsername = document.getElementById('setupUsername');
  const setupRepo = document.getElementById('setupRepo');
  const setupToken = document.getElementById('setupToken');
  const setupWebUrl = document.getElementById('setupWebUrl');
  const unlockMasterPassword = document.getElementById('unlockMasterPassword');
  const unlockTitle = document.getElementById('unlockTitle');
  const unlockSubtitle = document.getElementById('unlockSubtitle');
  const btnToggleSettings = document.getElementById('btnToggleSettings');
  const btnQuickDemo = document.getElementById('btnQuickDemo');
  const btnBiometricUnlock = document.getElementById('btnBiometricUnlock');
  
  const currentTabBox = document.getElementById('currentTabBox');
  const currentDomainLabel = document.getElementById('currentDomainLabel');
  const btnQuickAddCurrent = document.getElementById('btnQuickAddCurrent');
  
  const vaultSearch = document.getElementById('vaultSearch');
  const vaultList = document.getElementById('vaultList');
  const btnShowAddView = document.getElementById('btnShowAddView');
  const btnShowGenView = document.getElementById('btnShowGenView');
  
  const formAddCredential = document.getElementById('formAddCredential');
  const addTitle = document.getElementById('addTitle');
  const addUsername = document.getElementById('addUsername');
  const addPassword = document.getElementById('addPassword');
  const addUrl = document.getElementById('addUrl');
  const addTotp = document.getElementById('addTotp');
  const addNotes = document.getElementById('addNotes');
  const btnBackFromAdd = document.getElementById('btnBackFromAdd');
  const btnQuickGenInAdd = document.getElementById('btnQuickGenInAdd');
  
  const btnBackFromGen = document.getElementById('btnBackFromGen');
  const genResultText = document.getElementById('genResultText');
  const genLength = document.getElementById('genLength');
  const genLengthVal = document.getElementById('genLengthVal');
  const genUpper = document.getElementById('genUpper');
  const genLower = document.getElementById('genLower');
  const genNumbers = document.getElementById('genNumbers');
  const genSymbols = document.getElementById('genSymbols');
  const btnRegenerate = document.getElementById('btnRegenerate');
  const btnCopyGenPassword = document.getElementById('btnCopyGenPassword');
  
  const toastMessage = document.getElementById('toastMessage');

  // Active Session in memory
  let activeSession = {
    isUnlocked: false,
    isDemo: false,
    username: '',
    repo: '',
    token: '',
    filename: 'passwords.txt',
    masterPassword: '',
    webUrl: 'https://git-vault.onrender.com',
    fileSha: null,
    items: []
  };

  let currentTabUrl = '';
  let currentTabDomain = '';
  let totpIntervalId = null;

  // 1. Check Active Browser Tab Domain
  try {
    if (chrome && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && !tab.url.startsWith('chrome://')) {
        currentTabUrl = tab.url;
        const parsed = new URL(tab.url);
        currentTabDomain = parsed.hostname.replace(/^www\./, '');
        currentDomainLabel.textContent = currentTabDomain;
        currentTabBox.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.warn('Tab inspection notice:', err);
  }

  // 2. Load Stored Configuration
  const stored = await getLocalStorage([
    'gitpass_user',
    'gitpass_repo',
    'gitpass_token',
    'gitpass_filename',
    'gitpass_cached_master',
    'gitpass_biometric_enabled',
    'gitpass_biometric_id',
    'gitpass_biometric_payload',
    'gitvault_web_url'
  ]);

  if (stored.gitvault_web_url) {
    activeSession.webUrl = stored.gitvault_web_url;
  }
  if (setupWebUrl) {
    setupWebUrl.value = activeSession.webUrl;
  }

  // Asynchronously verify live connectivity with Render Cloud
  checkCloudConnectivity();

  async function checkCloudConnectivity() {
    const webUrl = (activeSession.webUrl || 'https://git-vault.onrender.com').replace(/\/$/, '');
    if (renderCloudBadge) renderCloudBadge.href = `${webUrl}/`;
    if (footerWebLink) footerWebLink.href = `${webUrl}/`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`${webUrl}/health/`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.status === 'healthy') {
          if (renderCloudBadge) {
            renderCloudBadge.innerHTML = `<span class="cloud-dot online"></span><span class="cloud-text">Render Live</span>`;
            renderCloudBadge.title = `Connected to ${webUrl} (Healthy). Click to open dashboard.`;
          }
          return;
        }
      }
    } catch (err) {
      // Offline, connecting, or network timeout
    }
    if (renderCloudBadge) {
      renderCloudBadge.innerHTML = `<span class="cloud-dot checking"></span><span class="cloud-text">Render Standby</span>`;
      renderCloudBadge.title = `Connecting to ${webUrl}... Click to open.`;
    }
  }

  // Check Biometrics Availability
  if (stored.gitpass_biometric_enabled && stored.gitpass_biometric_id && btnBiometricUnlock) {
    btnBiometricUnlock.classList.remove('hidden');
  }

  if (stored.gitpass_user && stored.gitpass_repo && stored.gitpass_token) {
    setupUsername.value = stored.gitpass_user;
    setupRepo.value = stored.gitpass_repo;
    setupToken.value = stored.gitpass_token;
    setupFields.classList.add('hidden');
    unlockTitle.textContent = `Unlock ${stored.gitpass_repo}`;
    unlockSubtitle.textContent = `Connected to github.com/${stored.gitpass_user}/${stored.gitpass_repo}`;
    btnToggleSettings.textContent = 'Edit GitHub Settings';

    // Auto-unlock if cached in session
    if (stored.gitpass_cached_master) {
      unlockMasterPassword.value = stored.gitpass_cached_master;
      performUnlock();
    }
  } else {
    setupFields.classList.remove('hidden');
    unlockTitle.textContent = 'Connect & Unlock';
    unlockSubtitle.textContent = 'Configure your private GitHub repository.';
    btnToggleSettings.classList.add('hidden');
  }

  // Helper: Toast
  function showToast(text, isError = false) {
    toastMessage.textContent = text;
    toastMessage.className = `popup-toast ${isError ? 'toast-error' : ''}`;
    toastMessage.classList.remove('hidden');
    setTimeout(() => {
      toastMessage.classList.add('hidden');
    }, 2500);
  }

  // Helper: Switch View
  function showView(view) {
    [viewUnlock, viewVault, viewAdd, viewGenerator].forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
  }

  // Helper: Copy Text
  async function copyText(text, successMsg = 'Copied to clipboard!') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch (err) {
      showToast('Clipboard copy failed', true);
    }
  }

  // Toggle Eye Visibility
  document.querySelectorAll('.eye-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🔒';
      }
    });
  });

  // Toggle Settings in Unlock View
  btnToggleSettings.addEventListener('click', () => {
    if (setupFields.classList.contains('hidden')) {
      setupFields.classList.remove('hidden');
      btnToggleSettings.textContent = 'Hide GitHub Settings';
    } else {
      setupFields.classList.add('hidden');
      btnToggleSettings.textContent = 'Edit GitHub Settings';
    }
  });

  // 3. Unlock Form Submission
  formUnlock.addEventListener('submit', async (e) => {
    e.preventDefault();
    await performUnlock();
  });

  async function performUnlock() {
    const username = setupUsername.value.trim();
    const repo = setupRepo.value.trim();
    const token = setupToken.value.trim();
    const masterPass = unlockMasterPassword.value;

    if (!username || !repo || !token) {
      showToast('Please fill in your GitHub username, repo & PAT', true);
      setupFields.classList.remove('hidden');
      return;
    }
    if (!masterPass) {
      showToast('Master password is required', true);
      return;
    }

    showToast('Connecting & Decrypting...', false);

    try {
      // 1. Verify GitHub Access
      await window.GitVaultGitHub.verifyAccess(token, username, repo);

      // 2. Fetch File from Repo
      const filename = stored.gitpass_filename || 'passwords.txt';
      const fileData = await window.GitVaultGitHub.fetchRepoFile(token, username, repo, filename);

      // 3. Decrypt Vault with Master Password
      let items = [];
      if (fileData.content) {
        items = await window.GitVaultCrypto.decryptVault(fileData.content, masterPass);
      }

      const webUrl = setupWebUrl ? (setupWebUrl.value.trim() || 'https://git-vault.onrender.com') : 'https://git-vault.onrender.com';
      activeSession.webUrl = webUrl;

      // 4. Save session config
      await setLocalStorage({
        gitpass_user: username,
        gitpass_repo: repo,
        gitpass_token: token,
        gitpass_filename: filename,
        gitpass_cached_master: masterPass,
        gitvault_web_url: webUrl
      });

      // 5. Populate Active Session
      activeSession = {
        isUnlocked: true,
        isDemo: false,
        username,
        repo,
        token,
        filename,
        masterPassword: masterPass,
        fileSha: fileData.sha,
        items
      };

      // 6. Transition to Vault View
      headerRepoTag.textContent = `${username}/${repo}`;
      headerActions.style.display = 'flex';
      renderVaultItems();
      showView(viewVault);
      showToast(`Decrypted ${items.length} passwords from GitHub!`);
      
      // Start live TOTP generator loop
      startTotpLoop();

      // Check pending auto-captures
      checkPendingCaptures();

    } catch (err) {
      showToast(`Unlock failed: ${err.message}`, true);
    }
  }

  // =========================================================================
  // WebAuthn Biometric Unlock (Touch ID, Windows Hello, Fingerprint)
  // =========================================================================
  if (btnBiometricUnlock) {
    btnBiometricUnlock.addEventListener('click', async () => {
      if (!window.PublicKeyCredential) {
        showToast('WebAuthn is not supported in this browser.', true);
        return;
      }

      const credConfig = await getLocalStorage(['gitpass_biometric_id', 'gitpass_biometric_payload']);
      if (!credConfig.gitpass_biometric_id || !credConfig.gitpass_biometric_payload) {
        showToast('No biometric credential registered.', true);
        return;
      }

      showToast('Scan fingerprint or Face ID...', false);

      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: challenge,
            allowCredentials: [{
              id: base64ToArrayBuffer(credConfig.gitpass_biometric_id),
              type: 'public-key'
            }],
            userVerification: 'required',
            timeout: 60000
          }
        });

        if (assertion) {
          // Decrypt master password using stored biometric key
          const rawItems = await window.GitVaultCrypto.decryptVault(
            credConfig.gitpass_biometric_payload,
            credConfig.gitpass_biometric_id
          );
          if (rawItems && rawItems[0]) {
            unlockMasterPassword.value = rawItems[0];
            await performUnlock();
            showToast('Biometric unlock verified!');
          }
        }
      } catch (err) {
        showToast(`Biometric verification cancelled: ${err.message}`, true);
      }
    });
  }

  // Toggle/Register Biometrics from Header
  if (btnToggleBiometrics) {
    btnToggleBiometrics.addEventListener('click', async () => {
      if (!activeSession.isUnlocked) return;
      if (!window.PublicKeyCredential) {
        showToast('WebAuthn biometrics not supported on this device.', true);
        return;
      }

      const conf = await getLocalStorage(['gitpass_biometric_enabled']);
      if (conf.gitpass_biometric_enabled) {
        if (confirm('Disable Biometric Unlock for this browser?')) {
          await setLocalStorage({
            gitpass_biometric_enabled: false,
            gitpass_biometric_id: '',
            gitpass_biometric_payload: ''
          });
          btnBiometricUnlock?.classList.add('hidden');
          showToast('Biometric unlock disabled.');
        }
        return;
      }

      showToast('Touch sensor / Windows Hello to enroll...', false);

      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

        const cred = await navigator.credentials.create({
          publicKey: {
            challenge: challenge,
            rp: { name: 'Git-Vault' },
            user: {
              id: userId,
              name: activeSession.username || 'vault-user',
              displayName: activeSession.username || 'Git-Vault User'
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },  // ES256
              { alg: -257, type: 'public-key' } // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required'
            },
            timeout: 60000
          }
        });

        if (cred) {
          const credIdB64 = arrayBufferToBase64(cred.rawId);
          // Protect master password with credential ID key
          const encryptedMaster = await window.GitVaultCrypto.encryptVault(
            [activeSession.masterPassword],
            credIdB64
          );

          await setLocalStorage({
            gitpass_biometric_enabled: true,
            gitpass_biometric_id: credIdB64,
            gitpass_biometric_payload: encryptedMaster
          });

          btnBiometricUnlock?.classList.remove('hidden');
          showToast('Biometric unlock enabled! Use fingerprint / Windows Hello.');
        }
      } catch (err) {
        showToast(`Enrollment failed: ${err.message}`, true);
      }
    });
  }

  // Instant Demo Mode
  btnQuickDemo.addEventListener('click', () => {
    activeSession = {
      isUnlocked: true,
      isDemo: true,
      username: 'demo-user',
      repo: 'git-vault-demo-vault',
      token: 'demo_token',
      filename: 'passwords.txt',
      masterPassword: 'DemoMasterPass123!',
      fileSha: 'demo-sha',
      items: [
        {
          id: crypto.randomUUID(),
          title: 'GitHub',
          username: 'developer@github.com',
          password: 'ghp_mock_token_demo_123',
          totp_secret: 'JBSWY3DPEHPK3PXP',
          url: 'https://github.com',
          category: 'Work',
          notes: 'Primary developer account'
        },
        {
          id: crypto.randomUUID(),
          title: 'Google',
          username: 'admin@google.com',
          password: 'xK9!mQ7#vL2$pZ8*',
          totp_secret: '',
          url: 'https://accounts.google.com',
          category: 'Work',
          notes: 'Company workspace'
        },
        {
          id: crypto.randomUUID(),
          title: 'ProtonMail',
          username: 'privacy_user@proton.me',
          password: 'T7@wP9$qR3!zY6#m',
          totp_secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
          url: 'https://mail.proton.me',
          category: 'Personal',
          notes: 'Encrypted private mail'
        }
      ]
    };

    headerRepoTag.textContent = 'demo-user/demo-vault';
    headerActions.style.display = 'flex';
    renderVaultItems();
    showView(viewVault);
    showToast('Demo vault active in memory!');
    startTotpLoop();
  });

  // Lock Vault
  btnLockVault.addEventListener('click', async () => {
    activeSession = { isUnlocked: false, items: [] };
    unlockMasterPassword.value = '';
    headerActions.style.display = 'none';
    if (totpIntervalId) clearInterval(totpIntervalId);
    await setLocalStorage({ gitpass_cached_master: '' });
    showView(viewUnlock);
    showToast('Vault locked.');
  });

  // Open Full Web App (git-vault.onrender.com or configured dashboard)
  btnOpenWeb.addEventListener('click', () => {
    const webUrl = (activeSession.webUrl || 'https://git-vault.onrender.com').replace(/\/$/, '') + '/';
    if (chrome && chrome.tabs) {
      chrome.tabs.create({ url: webUrl });
    } else {
      window.open(webUrl, '_blank');
    }
  });

  // 1-Click Cloud Sync in Extension
  btnSyncExt?.addEventListener('click', async () => {
    if (!activeSession.isUnlocked) return;
    if (activeSession.isDemo) {
      showToast('Demo vault is in-sync with memory.');
      return;
    }

    showToast('Syncing with GitHub cloud...', false);
    const syncSvg = btnSyncExt.querySelector('svg');
    if (syncSvg) syncSvg.style.animation = 'spin 0.8s linear infinite';

    try {
      const fileData = await window.GitVaultGitHub.fetchRepoFile(
        activeSession.token,
        activeSession.username,
        activeSession.repo,
        activeSession.filename
      );

      if (fileData.sha !== activeSession.fileSha && fileData.content) {
        const freshItems = await window.GitVaultCrypto.decryptVault(
          fileData.content,
          activeSession.masterPassword
        );
        activeSession.fileSha = fileData.sha;
        activeSession.items = freshItems;
        await renderVaultItems();
        showToast(`Cloud Sync Complete: Updated to commit ${(fileData.sha || '').slice(0, 7)} (${freshItems.length} items)!`);
      } else {
        showToast('Vault is 100% in sync with GitHub cloud storage.');
      }
    } catch (err) {
      showToast(`Cloud Sync Error: ${err.message}`, true);
    } finally {
      if (syncSvg) syncSvg.style.animation = '';
    }
  });

  // =========================================================================
  // Check Pending Auto-Captures
  // =========================================================================
  async function checkPendingCaptures() {
    const data = await getLocalStorage(['gitpass_pending_captures']);
    const captures = data.gitpass_pending_captures || [];
    if (captures.length === 0) return;

    const first = captures[0];
    const confirmSave = confirm(`Auto-Captured Login Detected:\n\nSite: ${first.title}\nUser: ${first.username}\n\nAdd and encrypt this credential to your GitHub repository now?`);
    if (confirmSave) {
      const newItem = {
        id: crypto.randomUUID(),
        title: first.title,
        username: first.username,
        password: first.password,
        url: first.url,
        totp_secret: '',
        category: 'Logins',
        notes: 'Auto-captured by Git-Vault extension',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      activeSession.items.unshift(newItem);
      renderVaultItems();
      
      if (!activeSession.isDemo) {
        try {
          const encrypted = await window.GitVaultCrypto.encryptVault(activeSession.items, activeSession.masterPassword);
          const newSha = await window.GitVaultGitHub.commitRepoFile(
            activeSession.token,
            activeSession.username,
            activeSession.repo,
            activeSession.filename,
            encrypted,
            `Auto-capture credential for ${newItem.title}`,
            activeSession.fileSha
          );
          activeSession.fileSha = newSha;
          showToast(`Saved & committed ${newItem.title} to GitHub!`);
        } catch (e) {
          showToast(`Commit failed: ${e.message}`, true);
        }
      } else {
        showToast(`Saved ${newItem.title} in demo session!`);
      }
    }

    // Clear queue
    await setLocalStorage({ gitpass_pending_captures: [] });
  }

  // =========================================================================
  // 4. Render Vault Items & Built-in 2FA Live Authenticator
  // =========================================================================
  async function renderVaultItems(filterQuery = '') {
    vaultList.innerHTML = '';
    const q = filterQuery.toLowerCase().trim();
    const items = activeSession.items || [];
    let sortedItems = [...items];

    if (currentTabDomain) {
      sortedItems.sort((a, b) => {
        const aMatches = (a.url && a.url.includes(currentTabDomain)) || a.title.toLowerCase().includes(currentTabDomain);
        const bMatches = (b.url && b.url.includes(currentTabDomain)) || b.title.toLowerCase().includes(currentTabDomain);
        return (bMatches ? 1 : 0) - (aMatches ? 1 : 0);
      });
    }

    const filtered = sortedItems.filter(item => {
      if (!q) return true;
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.url && item.url.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      vaultList.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-dim); font-size: 0.8rem;">
          ${q ? 'No credentials match your filter.' : 'Vault is empty. Click "+ Add Password" above.'}
        </div>
      `;
      return;
    }

    for (const item of filtered) {
      const card = document.createElement('div');
      card.className = 'vault-item-card';

      const isCurrentDomain = currentTabDomain && (
        (item.url && item.url.includes(currentTabDomain)) ||
        item.title.toLowerCase().includes(currentTabDomain)
      );

      const avatarInitials = (item.title || 'VA').slice(0, 2).toUpperCase();

      let totpHtml = '';
      if (item.totp_secret) {
        const totpData = await computeTotpCode(item.totp_secret);
        const codeDisplay = totpData ? `${totpData.code.slice(0, 3)} ${totpData.code.slice(3)}` : '------';
        const remaining = totpData ? totpData.remaining : 30;

        totpHtml = `
          <div class="totp-auth-pill mt-2 p-2 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between" id="ext-totp-${item.id}" data-secret="${escapeHtml(item.totp_secret)}" style="margin-top: 0.5rem; padding: 0.45rem 0.65rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="ext-sec-${item.id}" style="font-size: 10px; font-weight: 800; color: #34d399; font-family: monospace; border: 1px solid rgba(52, 211, 153, 0.4); padding: 1px 4px; border-radius: 6px;">${remaining}s</span>
              <div>
                <div style="font-size: 8px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.05em;">2FA Code</div>
                <div id="ext-code-${item.id}" style="font-size: 13px; font-family: monospace; font-weight: 800; color: #ffffff; letter-spacing: 0.12em;">${codeDisplay}</div>
              </div>
            </div>
            <button type="button" class="action-chip-btn btn-copy-totp" data-item="${item.id}" style="padding: 2px 7px; font-size: 10px; color: #34d399; border-color: rgba(52, 211, 153, 0.4);">Copy 2FA</button>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="item-top-row">
          <div class="item-title-col">
            <div class="item-avatar-dot">${avatarInitials}</div>
            <span class="item-title">${escapeHtml(item.title)}</span>
            ${isCurrentDomain ? '<span class="item-badge" style="color: var(--emerald-accent); border-color: rgba(52,211,153,0.3);">Current Site</span>' : ''}
          </div>
          <span class="item-badge">${escapeHtml(item.category || 'Login')}</span>
        </div>

        <div class="item-data-row">
          <span class="item-cred-text">${escapeHtml(item.username)}</span>
          <div class="item-actions-group">
            <button type="button" class="action-chip-btn btn-copy-user" title="Copy Username">Copy</button>
          </div>
        </div>

        <div class="item-data-row">
          <span class="item-cred-text pwd-masked" id="pwd-${item.id}">••••••••••••</span>
          <div class="item-actions-group">
            <button type="button" class="action-chip-btn btn-toggle-pwd" title="Reveal / Hide">👁</button>
            <button type="button" class="action-chip-btn btn-copy-pwd" title="Copy Password">Copy</button>
          </div>
        </div>

        ${totpHtml}
      `;

      // Copy username
      card.querySelector('.btn-copy-user')?.addEventListener('click', () => {
        copyText(item.username, 'Username copied!');
      });

      // Toggle password
      const pwdEl = card.querySelector(`#pwd-${item.id}`);
      let isRevealed = false;
      card.querySelector('.btn-toggle-pwd')?.addEventListener('click', () => {
        isRevealed = !isRevealed;
        pwdEl.textContent = isRevealed ? item.password : '••••••••••••';
      });

      // Copy password
      card.querySelector('.btn-copy-pwd')?.addEventListener('click', () => {
        copyText(item.password, 'Password copied!');
      });

      // Copy TOTP 2FA code
      card.querySelector('.btn-copy-totp')?.addEventListener('click', () => {
        const codeEl = card.querySelector(`#ext-code-${item.id}`);
        if (codeEl) {
          const raw = codeEl.textContent.replace(/\s+/g, '');
          copyText(raw, '2FA Authenticator code copied!');
        }
      });

      vaultList.appendChild(card);
    }
  }

  vaultSearch.addEventListener('input', (e) => {
    renderVaultItems(e.target.value);
  });

  // Start live rolling TOTP loop
  function startTotpLoop() {
    if (totpIntervalId) clearInterval(totpIntervalId);
    totpIntervalId = setInterval(async () => {
      const totpCards = document.querySelectorAll('.totp-auth-pill');
      if (totpCards.length === 0) return;

      const epoch = Math.floor(Date.now() / 1000);
      const remaining = 30 - (epoch % 30);

      for (const el of totpCards) {
        const itemId = el.id.replace('ext-totp-', '');
        const secret = el.getAttribute('data-secret');
        const secEl = document.getElementById(`ext-sec-${itemId}`);
        const codeEl = document.getElementById(`ext-code-${itemId}`);

        if (secEl) secEl.textContent = `${remaining}s`;

        if (remaining === 30 || remaining === 1) {
          const res = await computeTotpCode(secret);
          if (res && codeEl) {
            codeEl.textContent = `${res.code.slice(0, 3)} ${res.code.slice(3)}`;
          }
        }
      }
    }, 1000);
  }

  // 5. Add Credential View
  btnShowAddView.addEventListener('click', () => {
    formAddCredential.reset();
    if (currentTabDomain) {
      addTitle.value = capitalize(currentTabDomain.split('.')[0]);
      addUrl.value = currentTabUrl;
    }
    showView(viewAdd);
  });

  btnQuickAddCurrent.addEventListener('click', () => {
    formAddCredential.reset();
    addTitle.value = capitalize(currentTabDomain.split('.')[0]);
    addUrl.value = currentTabUrl;
    showView(viewAdd);
  });

  btnBackFromAdd.addEventListener('click', () => {
    showView(viewVault);
  });

  btnQuickGenInAdd.addEventListener('click', () => {
    const pwd = window.GitVaultCrypto.generatePassword({ length: 20 });
    addPassword.value = pwd;
    addPassword.type = 'text';
    showToast('Strong password generated!');
  });

  formAddCredential.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newItem = {
      id: crypto.randomUUID(),
      title: addTitle.value.trim(),
      username: addUsername.value.trim(),
      password: addPassword.value,
      url: addUrl.value.trim(),
      totp_secret: addTotp.value.trim(),
      category: 'Logins',
      notes: addNotes.value.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    showToast('Encrypting & Committing...', false);

    try {
      if (activeSession.isDemo) {
        activeSession.items.unshift(newItem);
        await renderVaultItems();
        showView(viewVault);
        showToast('Credential saved in demo session!');
        return;
      }

      // 1. Fetch latest file to prevent SHA mismatch
      const latestFile = await window.GitVaultGitHub.fetchRepoFile(
        activeSession.token,
        activeSession.username,
        activeSession.repo,
        activeSession.filename
      );

      let currentItems = [];
      if (latestFile.content) {
        currentItems = await window.GitVaultCrypto.decryptVault(latestFile.content, activeSession.masterPassword);
      }

      // 2. Prepend new item
      currentItems.unshift(newItem);

      // 3. Encrypt payload
      const encryptedPayload = await window.GitVaultCrypto.encryptVault(currentItems, activeSession.masterPassword);

      // 4. Commit to GitHub
      const newSha = await window.GitVaultGitHub.commitRepoFile(
        activeSession.token,
        activeSession.username,
        activeSession.repo,
        activeSession.filename,
        encryptedPayload,
        `Add credential for ${newItem.title} via Git-Vault WebExtension`,
        latestFile.sha
      );

      activeSession.fileSha = newSha;
      activeSession.items = currentItems;

      await renderVaultItems();
      showView(viewVault);
      showToast(`Encrypted & committed ${newItem.title} to GitHub!`);
    } catch (err) {
      showToast(`Save failed: ${err.message}`, true);
    }
  });

  // 6. Generator View
  btnShowGenView.addEventListener('click', () => {
    updateGeneratorDisplay();
    showView(viewGenerator);
  });

  btnBackFromGen.addEventListener('click', () => {
    showView(viewVault);
  });

  function updateGeneratorDisplay() {
    const len = parseInt(genLength.value, 10);
    genLengthVal.textContent = len;

    const pwd = window.GitVaultCrypto.generatePassword({
      length: len,
      upper: genUpper.checked,
      lower: genLower.checked,
      numbers: genNumbers.checked,
      symbols: genSymbols.checked
    });
    genResultText.textContent = pwd;
  }

  [genLength, genUpper, genLower, genNumbers, genSymbols].forEach(ctrl => {
    ctrl.addEventListener('input', updateGeneratorDisplay);
  });

  btnRegenerate.addEventListener('click', updateGeneratorDisplay);

  btnCopyGenPassword.addEventListener('click', () => {
    copyText(genResultText.textContent, 'Generated password copied!');
  });

  // =========================================================================
  // Cryptographic RFC 6238 TOTP Engine
  // =========================================================================
  function base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let cleaned = str.replace(/[\s=-]/g, '').toUpperCase();
    let bits = 0, val = 0;
    const bytes = [];
    for (let i = 0; i < cleaned.length; i++) {
      const idx = alphabet.indexOf(cleaned[i]);
      if (idx === -1) continue;
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((val >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(bytes);
  }

  async function computeTotpCode(secretOrUri, timeStep = 30) {
    if (!secretOrUri) return null;
    try {
      let secret = secretOrUri.trim();
      if (secret.startsWith('otpauth://')) {
        const u = new URL(secret);
        secret = u.searchParams.get('secret') || secret;
      }

      const keyBytes = base32Decode(secret);
      if (keyBytes.length === 0) return null;

      const epoch = Math.floor(Date.now() / 1000);
      const counter = Math.floor(epoch / timeStep);
      const remaining = timeStep - (epoch % timeStep);

      const counterBuf = new ArrayBuffer(8);
      const view = new DataView(counterBuf);
      view.setUint32(4, counter, false);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
      );
      const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuf);
      const sigBytes = new Uint8Array(signature);
      const offset = sigBytes[sigBytes.length - 1] & 0x0f;
      const code = ((sigBytes[offset] & 0x7f) << 24 |
                    (sigBytes[offset + 1] & 0xff) << 16 |
                    (sigBytes[offset + 2] & 0xff) << 8 |
                    (sigBytes[offset + 3] & 0xff)) % 1000000;
      return {
        code: String(code).padStart(6, '0'),
        remaining: remaining
      };
    } catch {
      return null;
    }
  }

  // Utilities
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function getLocalStorage(keys) {
    return new Promise(resolve => {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, resolve);
      } else {
        const res = {};
        keys.forEach(k => { res[k] = localStorage.getItem(k) || ''; });
        resolve(res);
      }
    });
  }

  function setLocalStorage(obj) {
    return new Promise(resolve => {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, resolve);
      } else {
        Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, v));
        resolve();
      }
    });
  }
});
