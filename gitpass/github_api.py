"""
GitHub REST API integration client for Git-Vault.
Handles zero-server storage: all user encrypted files are read from
and written directly to the user's personal GitHub repository.
"""

import base64
import requests
from typing import Tuple, Optional


class GitHubError(Exception):
    """Base exception for GitHub API calls."""
    pass


class GitHubAuthError(GitHubError):
    """Raised on invalid token or authentication failure."""
    pass


class GitHubRepoNotFoundError(GitHubError):
    """Raised when the specified repository cannot be found or is inaccessible."""
    pass


class GitHubPermissionError(GitHubError):
    """Raised when token lacks permissions (e.g. repo scope)."""
    pass


class GitHubRateLimitError(GitHubError):
    """Raised when GitHub rate limit is exceeded."""
    pass


GITHUB_API_BASE = "https://api.github.com"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Git-Vault-App",
    }


def verify_repo_access(token: str, owner: str, repo: str) -> dict:
    """Verifies that the token can access the repository."""
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}"
    try:
        resp = requests.get(url, headers=_headers(token), timeout=10)
    except requests.RequestException as e:
        raise GitHubError(f"Network error connecting to GitHub: {e}")

    if resp.status_code == 401:
        raise GitHubAuthError("Invalid GitHub Personal Access Token. Please check your token.")
    if resp.status_code == 404:
        raise GitHubRepoNotFoundError(
            f"Repository '{owner}/{repo}' not found. Make sure the repository exists and your token has 'repo' scope."
        )
    if resp.status_code == 403:
        if "rate limit" in resp.text.lower():
            raise GitHubRateLimitError("GitHub API rate limit exceeded. Please wait a few minutes.")
        raise GitHubPermissionError("Forbidden. Ensure your Personal Access Token has 'repo' permission scope.")
    if not resp.ok:
        raise GitHubError(f"GitHub API error ({resp.status_code}): {resp.text}")

    return resp.json()


def get_repo_file(token: str, owner: str, repo: str, file_path: str) -> Tuple[str, Optional[str]]:
    """
    Fetches file content from the user's GitHub repository.
    Returns (raw_content_str, sha).
    If the file does not exist, returns ("", None).
    """
    clean_path = file_path.strip().lstrip("/")
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}/contents/{clean_path}"
    try:
        resp = requests.get(url, headers=_headers(token), timeout=10)
    except requests.RequestException as e:
        raise GitHubError(f"Network error fetching vault file: {e}")

    if resp.status_code == 404:
        return "", None

    if resp.status_code == 401:
        raise GitHubAuthError("Unauthorized: Invalid GitHub Personal Access Token.")
    if resp.status_code == 403:
        raise GitHubPermissionError("Forbidden: Insufficient permissions to access this repository file.")
    if not resp.ok:
        raise GitHubError(f"Failed to fetch file from GitHub ({resp.status_code}): {resp.text}")

    data = resp.json()
    if isinstance(data, list):
        raise GitHubError(f"'{file_path}' is a directory, not a file.")

    sha = data.get("sha")
    content_b64 = data.get("content", "")
    try:
        raw_content = base64.b64decode(content_b64).decode("utf-8")
    except Exception as e:
        raise GitHubError(f"Failed to decode file content from GitHub: {e}")

    return raw_content, sha


def update_or_create_repo_file(
    token: str,
    owner: str,
    repo: str,
    file_path: str,
    content: str,
    commit_message: str,
    sha: Optional[str] = None,
) -> str:
    """
    Commits an encrypted file update to the repository.
    Returns the new file SHA.
    """
    clean_path = file_path.strip().lstrip("/")
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}/contents/{clean_path}"

    payload = {
        "message": commit_message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
    }
    if sha:
        payload["sha"] = sha

    try:
        resp = requests.put(url, json=payload, headers=_headers(token), timeout=15)
    except requests.RequestException as e:
        raise GitHubError(f"Network error committing to GitHub: {e}")

    if resp.status_code in (200, 201):
        data = resp.json()
        return data.get("content", {}).get("sha", "")
    elif resp.status_code == 409:
        # Conflict (file was updated elsewhere)
        # Attempt to get fresh SHA and retry once
        _, fresh_sha = get_repo_file(token, owner, repo, clean_path)
        if fresh_sha:
            payload["sha"] = fresh_sha
            retry_resp = requests.put(url, json=payload, headers=_headers(token), timeout=15)
            if retry_resp.status_code in (200, 201):
                return retry_resp.json().get("content", {}).get("sha", "")
        raise GitHubError("GitHub commit conflict (SHA mismatch). Please refresh the page and try again.")
    elif resp.status_code == 401:
        raise GitHubAuthError("Unauthorized: Token lacks write permissions.")
    elif resp.status_code == 403:
        raise GitHubPermissionError("Forbidden: Cannot write to repository. Check token scopes.")
    else:
        raise GitHubError(f"Failed to commit file to GitHub ({resp.status_code}): {resp.text}")


def delete_repository(token: str, owner: str, repo: str) -> bool:
    """
    Permanently deletes the repository on GitHub.
    Allows user to completely destroy their vault at any time.
    Requires token to have `delete_repo` scope.
    """
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}"
    try:
        resp = requests.delete(url, headers=_headers(token), timeout=15)
    except requests.RequestException as e:
        raise GitHubError(f"Network error deleting repository: {e}")

    if resp.status_code == 204:
        return True
    elif resp.status_code == 403:
        raise GitHubPermissionError(
            "Forbidden: Your Personal Access Token does not have 'delete_repo' scope. "
            "Please delete the repository directly on GitHub or grant 'delete_repo' permission."
        )
    elif resp.status_code == 404:
        raise GitHubRepoNotFoundError("Repository not found or already deleted.")
    else:
        raise GitHubError(f"Failed to delete repository ({resp.status_code}): {resp.text}")


def list_file_commits(token: str, owner: str, repo: str, file_path: str = "passwords.txt", limit: int = 15) -> list:
    """
    Fetches historical commits for the vault file from the user's GitHub repository.
    Enables the Time Machine rollback feature.
    """
    clean_path = file_path.strip().lstrip("/")
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}/commits"
    params = {"path": clean_path, "per_page": limit}

    try:
        resp = requests.get(url, params=params, headers=_headers(token), timeout=12)
    except requests.RequestException as e:
        raise GitHubError(f"Network error listing commits: {e}")

    if resp.status_code == 404:
        return []
    if not resp.ok:
        raise GitHubError(f"Failed to fetch commit history ({resp.status_code}): {resp.text}")

    commits = []
    for item in resp.json():
        sha = item.get("sha", "")
        commit_info = item.get("commit", {})
        author_info = commit_info.get("author", {}) or {}
        commits.append({
            "sha": sha,
            "short_sha": sha[:7],
            "message": commit_info.get("message", "Update vault"),
            "author": author_info.get("name", "You"),
            "date": author_info.get("date", ""),
        })
    return commits


def get_file_at_commit(token: str, owner: str, repo: str, file_path: str, commit_sha: str) -> str:
    """
    Retrieves the vault file ciphertext at a specific commit snapshot.
    """
    clean_path = file_path.strip().lstrip("/")
    url = f"{GITHUB_API_BASE}/repos/{owner.strip()}/{repo.strip()}/contents/{clean_path}"
    params = {"ref": commit_sha.strip()}

    try:
        resp = requests.get(url, params=params, headers=_headers(token), timeout=12)
    except requests.RequestException as e:
        raise GitHubError(f"Network error fetching historical commit: {e}")

    if resp.status_code == 404:
        return ""
    if not resp.ok:
        raise GitHubError(f"Failed to fetch historical commit ({resp.status_code}): {resp.text}")

    data = resp.json()
    raw_b64 = data.get("content", "")
    try:
        return base64.b64decode(raw_b64).decode("utf-8")
    except Exception as e:
        raise GitHubError(f"Failed to decode historical commit file content: {e}")

