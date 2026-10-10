/**
 * Git-Pass WebExtension GitHub API Client
 * Direct Zero-Server connection to private GitHub repositories
 */

const GITHUB_API_BASE = 'https://api.github.com';

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  // Clean newlines from GitHub base64 payload
  const clean = str.replace(/\s/g, '');
  return decodeURIComponent(escape(atob(clean)));
}

async function verifyAccess(token, owner, repo) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitPass-WebExtension'
    }
  });

  if (resp.status === 401) {
    throw new Error('Invalid GitHub Personal Access Token.');
  }
  if (resp.status === 404) {
    throw new Error(`Repository "${owner}/${repo}" was not found or your token lacks "repo" scope.`);
  }
  if (!resp.ok) {
    throw new Error(`GitHub Error (${resp.status}): ${resp.statusText}`);
  }
  return await resp.json();
}

async function fetchRepoFile(token, owner, repo, filePath = 'passwords.txt') {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitPass-WebExtension'
    }
  });

  if (resp.status === 404) {
    return { content: null, sha: null };
  }
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const rawText = base64ToUtf8(data.content);
  return { content: rawText, sha: data.sha };
}

async function commitRepoFile(token, owner, repo, filePath, newContent, message, sha) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`;
  const payload = {
    message: message || `Update ${filePath} via Git-Pass WebExtension`,
    content: utf8ToBase64(newContent)
  };

  if (sha) {
    payload.sha = sha;
  }

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'GitPass-WebExtension'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(`GitHub commit failed: ${errData.message || resp.statusText}`);
  }

  const data = await resp.json();
  return data.content.sha;
}

if (typeof window !== 'undefined') {
  window.GitPassGitHub = {
    verifyAccess,
    fetchRepoFile,
    commitRepoFile
  };
}
