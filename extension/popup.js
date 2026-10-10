/**
 * Git-Pass WebExtension Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const viewUnlock = document.getElementById('viewUnlock');
  const viewVault = document.getElementById('viewVault');
  const viewAdd = document.getElementById('viewAdd');
  const viewGenerator = document.getElementById('viewGenerator');
  
  const headerActions = document.getElementById('headerActions');
  const headerRepoTag = document.getElementById('headerRepoTag');
  const btnLockVault = document.getElementById('btnLockVault');
  const btnOpenWeb = document.getElementById('btnOpenWeb');
  
  const formUnlock = document.getElementById('formUnlock');
  const setupFields = document.getElementById('setupFields');
  const setupUsername = document.getElementById('setupUsername');
  const setupRepo = document.getElementById('setupRepo');
  const setupToken = document.getElementById('setupToken');
  const unlockMasterPassword = document.getElementById('unlockMasterPassword');
  const unlockTitle = document.getElementById('unlockTitle');
  const unlockSubtitle = document.getElementById('unlockSubtitle');
  const btnToggleSettings = document.getElementById('btnToggleSettings');
  const btnQuickDemo = document.getElementById('btnQuickDemo');
  
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

  // In-Memory Active Session
  let activeSession = {
    isUnlocked: false,
    isDemo: false,
    username: '',
    repo: '',
    token: '',
    filename: 'passwords.txt',
    masterPassword: '',
    fileSha: null,
    items: []
  };

  let currentTabUrl = '';
  let currentTabDomain = '';

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
    'gitpass_cached_master'
  ]);

  if (stored.gitpass_user && stored.gitpass_repo && stored.gitpass_token) {
    setupUsername.value = stored.gitpass_user;
    setupRepo.value = stored.gitpass_repo;
    setupToken.value = stored.gitpass_token;
    setupFields.classList.add('hidden');
    unlockTitle.textContent = `Unlock ${stored.gitpass_repo}`;
    unlockSubtitle.textContent = `Connected to github.com/${stored.gitpass_user}/${stored.gitpass_repo}`;
    btnToggleSettings.textContent = 'Edit GitHub Settings';

    // Auto-unlock if session password cached
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

  // 3. Unlock Logic
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
      await window.GitPassGitHub.verifyAccess(token, username, repo);

      // 2. Fetch File from Repo
      const filename = stored.gitpass_filename || 'passwords.txt';
      const fileData = await window.GitPassGitHub.fetchRepoFile(token, username, repo, filename);

      // 3. Decrypt Vault with Master Password
      let items = [];
      if (fileData.content) {
        items = await window.GitPassCrypto.decryptVault(fileData.content, masterPass);
      }

      // 4. Save credentials to storage (PAT & user, but NOT master password)
      await setLocalStorage({
        gitpass_user: username,
        gitpass_repo: repo,
        gitpass_token: token,
        gitpass_filename: filename,
        gitpass_cached_master: masterPass
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
        items: items || []
      };

      headerRepoTag.textContent = `${username}/${repo}`;
      headerActions.style.display = 'flex';
      renderVaultItems();
      showView(viewVault);
      showToast(`Unlocked ${activeSession.items.length} passwords!`);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // Quick Demo Mode
  btnQuickDemo.addEventListener('click', () => {
    activeSession = {
      isUnlocked: true,
      isDemo: true,
      username: 'demo-user',
      repo: 'git-vault-demo',
      token: 'mock-token',
      filename: 'passwords.txt',
      masterPassword: 'DemoMasterPass123!',
      fileSha: 'demo-sha',
      items: [
        {
          id: '1',
          title: 'GitHub',
          username: 'octocat@github.com',
          password: 'ghp_mock_demo_token_12345',
          url: 'https://github.com',
          category: 'Work',
          notes: 'Developer account'
        },
        {
          id: '2',
          title: 'Google Workspace',
          username: 'admin@workspace.com',
          password: 'xK9!mQ7#vL2$pZ8*',
          url: 'https://accounts.google.com',
          category: 'Work',
          notes: 'Corporate admin'
        },
        {
          id: '3',
          title: 'ProtonMail',
          username: 'privacy_user@proton.me',
          password: 'T7@wP9$qR3!zY6#m',
          url: 'https://mail.proton.me',
          category: 'Personal',
          notes: 'Encrypted email'
        }
      ]
    };

    headerRepoTag.textContent = 'Demo Mode';
    headerActions.style.display = 'flex';
    renderVaultItems();
    showView(viewVault);
    showToast('Loaded demo vault session!');
  });

  // Lock Vault
  btnLockVault.addEventListener('click', async () => {
    activeSession = { isUnlocked: false, items: [] };
    await setLocalStorage({ gitpass_cached_master: '' });
    unlockMasterPassword.value = '';
    headerActions.style.display = 'none';
    showView(viewUnlock);
    showToast('Vault locked.');
  });

  // Open Full Web Dashboard
  btnOpenWeb.addEventListener('click', () => {
    if (chrome && chrome.tabs) {
      chrome.tabs.create({ url: 'http://localhost:8000/' });
    } else {
      window.open('http://localhost:8000/', '_blank');
    }
  });

  // 4. Render Vault Items & Filter
  function renderVaultItems(filterQuery = '') {
    vaultList.innerHTML = '';
    const q = filterQuery.toLowerCase().trim();

    // Check if items match current domain first
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

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-item-card';

      const isCurrentDomain = currentTabDomain && (
        (item.url && item.url.includes(currentTabDomain)) ||
        item.title.toLowerCase().includes(currentTabDomain)
      );

      const avatarInitials = (item.title || 'VA').slice(0, 2).toUpperCase();

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
      `;

      // Copy username
      card.querySelector('.btn-copy-user').addEventListener('click', () => {
        copyText(item.username, 'Username copied!');
      });

      // Toggle password
      const pwdEl = card.querySelector(`#pwd-${item.id}`);
      let isRevealed = false;
      card.querySelector('.btn-toggle-pwd').addEventListener('click', () => {
        isRevealed = !isRevealed;
        pwdEl.textContent = isRevealed ? item.password : '••••••••••••';
      });

      // Copy password
      card.querySelector('.btn-copy-pwd').addEventListener('click', () => {
        copyText(item.password, 'Password copied!');
      });

      vaultList.appendChild(card);
    });
  }

  vaultSearch.addEventListener('input', (e) => {
    renderVaultItems(e.target.value);
  });

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
    const pwd = window.GitPassCrypto.generatePassword({ length: 20 });
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
      category: 'Logins',
      notes: addNotes.value.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    showToast('Encrypting & Committing...', false);

    try {
      if (activeSession.isDemo) {
        activeSession.items.unshift(newItem);
        renderVaultItems();
        showView(viewVault);
        showToast('Credential saved in demo session!');
        return;
      }

      // 1. Fetch latest file to prevent SHA mismatch
      const latestFile = await window.GitPassGitHub.fetchRepoFile(
        activeSession.token,
        activeSession.username,
        activeSession.repo,
        activeSession.filename
      );

      let currentItems = [];
      if (latestFile.content) {
        currentItems = await window.GitPassCrypto.decryptVault(latestFile.content, activeSession.masterPassword);
      }

      // 2. Prepend new item
      currentItems.unshift(newItem);

      // 3. Encrypt payload
      const encryptedPayload = await window.GitPassCrypto.encryptVault(currentItems, activeSession.masterPassword);

      // 4. Commit to GitHub
      const newSha = await window.GitPassGitHub.commitRepoFile(
        activeSession.token,
        activeSession.username,
        activeSession.repo,
        activeSession.filename,
        encryptedPayload,
        `Add credential for ${newItem.title} via Git-Pass WebExtension`,
        latestFile.sha
      );

      activeSession.fileSha = newSha;
      activeSession.items = currentItems;

      renderVaultItems();
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

    const pwd = window.GitPassCrypto.generatePassword({
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

  // Helpers
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
