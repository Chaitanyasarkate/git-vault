"""
Universal Password Importer Engine for Git-Vault.
Parses and normalizes password exports from:
- Google Chrome, Brave, Chromium, Edge (.csv)
- Bitwarden (.csv and .json)
- Mozilla Firefox (.csv)
- 1Password & LastPass (.csv)
- Git-Vault Native Exports (.csv and .json)
"""

import csv
import io
import json
import uuid
import datetime
from urllib.parse import urlparse
from typing import List, Dict, Any, Tuple


class ImportError(Exception):
    """Raised when an uploaded password file is corrupted or unsupported."""
    pass


def _clean_str(val: Any) -> str:
    """Safely converts to stripped string."""
    if val is None:
        return ""
    return str(val).strip()


def _derive_title_from_url(url: str) -> str:
    """Derives a clean title like 'github.com' from a URL if title is missing."""
    if not url:
        return "Imported Account"
    try:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        parsed = urlparse(url)
        host = parsed.netloc or parsed.path
        if host.startswith("www."):
            host = host[4:]
        return host.split(":")[0] or "Imported Account"
    except Exception:
        return "Imported Account"


def _guess_category(title: str, url: str) -> str:
    """Intelligently guesses category based on title or URL keywords."""
    combined = f"{title} {url}".lower()
    if any(k in combined for k in ("bank", "paypal", "stripe", "crypto", "coinbase", "binance", "finance", "chase", "wells")):
        return "Finance"
    if any(k in combined for k in ("twitter", "x.com", "instagram", "facebook", "reddit", "linkedin", "tiktok", "discord", "social")):
        return "Social"
    if any(k in combined for k in ("github", "gitlab", "jira", "slack", "aws", "azure", "docker", "vercel", "render", "dev")):
        return "Work"
    if any(k in combined for k in ("steam", "spotify", "netflix", "app", "desktop")):
        return "Apps"
    return "Logins"


def parse_import_file(raw_bytes: bytes, filename: str = "") -> List[Dict[str, Any]]:
    """
    Parses raw uploaded file bytes into a list of normalized Git-Vault credential items.
    """
    if not raw_bytes:
        raise ImportError("Uploaded file is empty.")

    # Try decoding text
    text_content = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text_content = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if text_content is None:
        raise ImportError("Could not decode file encoding. Please ensure the file is valid UTF-8 text.")

    text_content = text_content.strip()
    if not text_content:
        raise ImportError("The uploaded file does not contain any readable data.")

    # Check if JSON
    is_json = filename.lower().endswith(".json") or text_content.startswith(("[", "{"))
    if is_json:
        return _parse_json_export(text_content)
    else:
        return _parse_csv_export(text_content)


def _parse_json_export(text_content: str) -> List[Dict[str, Any]]:
    """Parses JSON password exports (Bitwarden JSON, Git-Vault JSON, or generic array)."""
    try:
        data = json.loads(text_content)
    except json.JSONDecodeError as e:
        raise ImportError(f"Invalid JSON file format: {e}")

    items: List[Dict[str, Any]] = []
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 1. Bitwarden JSON export structure: { "encrypted": false, "items": [...] }
    if isinstance(data, dict) and "items" in data and isinstance(data["items"], list):
        for raw_item in data["items"]:
            if not isinstance(raw_item, dict):
                continue
            login_data = raw_item.get("login") or {}
            title = _clean_str(raw_item.get("name"))
            username = _clean_str(login_data.get("username"))
            password = _clean_str(login_data.get("password"))
            totp = _clean_str(login_data.get("totp"))
            notes = _clean_str(raw_item.get("notes"))
            
            # URIs in Bitwarden
            uris = login_data.get("uris") or []
            url = ""
            if uris and isinstance(uris, list) and isinstance(uris[0], dict):
                url = _clean_str(uris[0].get("uri"))
            elif uris and isinstance(uris, list) and isinstance(uris[0], str):
                url = _clean_str(uris[0])

            if not title and url:
                title = _derive_title_from_url(url)
            if not title:
                title = "Imported Account"

            if not password and not username:
                continue

            items.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "username": username,
                "password": password,
                "url": url,
                "totp_secret": totp,
                "category": _guess_category(title, url),
                "notes": notes,
                "created_at": now_iso,
                "updated_at": now_iso,
            })
        return items

    # 2. Direct JSON array (Git-Vault export or generic array)
    if isinstance(data, list):
        for raw in data:
            if not isinstance(raw, dict):
                continue
            title = _clean_str(raw.get("title") or raw.get("name"))
            username = _clean_str(raw.get("username") or raw.get("user") or raw.get("login"))
            password = _clean_str(raw.get("password") or raw.get("pass"))
            url = _clean_str(raw.get("url") or raw.get("uri"))
            totp = _clean_str(raw.get("totp_secret") or raw.get("totp"))
            notes = _clean_str(raw.get("notes") or raw.get("note"))
            category = _clean_str(raw.get("category")) or _guess_category(title, url)

            if not title and url:
                title = _derive_title_from_url(url)
            if not title:
                title = "Imported Account"

            if not password and not username:
                continue

            items.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "username": username,
                "password": password,
                "url": url,
                "totp_secret": totp,
                "category": category,
                "notes": notes,
                "created_at": now_iso,
                "updated_at": now_iso,
            })
        return items

    raise ImportError("Unrecognized JSON password structure. Expected array or Bitwarden items dictionary.")


def _parse_csv_export(text_content: str) -> List[Dict[str, Any]]:
    """Parses CSV password exports (Chrome, Bitwarden, Firefox, LastPass, 1Password, Git-Vault)."""
    stream = io.StringIO(text_content)
    reader = csv.reader(stream)
    
    rows = list(reader)
    if not rows:
        raise ImportError("CSV file is empty.")

    header = [h.strip() for h in rows[0]]
    if not header:
        raise ImportError("CSV file lacks a header row.")

    # Create case-insensitive map of column names to indices
    col_map = {col.lower().replace(" ", "").replace("_", ""): idx for idx, col in enumerate(header)}

    def get_val(row_items: list, *candidate_keys: str) -> str:
        for key in candidate_keys:
            normalized = key.lower().replace(" ", "").replace("_", "")
            if normalized in col_map:
                idx = col_map[normalized]
                if idx < len(row_items):
                    return _clean_str(row_items[idx])
        return ""

    items: List[Dict[str, Any]] = []
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for row in rows[1:]:
        if not row or not any(row):
            continue

        # Extract fields using candidate keys from different password managers
        title = get_val(row, "name", "title", "sitename", "service")
        username = get_val(row, "username", "loginusername", "user", "login", "email")
        password = get_val(row, "password", "loginpassword", "pass")
        url = get_val(row, "url", "loginuri", "uri", "website", "address")
        totp = get_val(row, "totpsecret", "logintotp", "totp", "2fa", "twofactor")
        notes = get_val(row, "notes", "note", "extra", "comments")
        category = get_val(row, "category", "folder", "grouping")

        if not title and url:
            title = _derive_title_from_url(url)
        if not title:
            title = "Imported Account"

        if not category:
            category = _guess_category(title, url)

        # Skip rows with no credentials whatsoever
        if not password and not username:
            continue

        items.append({
            "id": str(uuid.uuid4()),
            "title": title,
            "username": username,
            "password": password,
            "url": url,
            "totp_secret": totp,
            "category": category,
            "notes": notes,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    if not items:
        raise ImportError("No credentials could be parsed from the CSV file. Please verify the file has name/url, username, and password columns.")

    return items


def merge_vault_items(existing_items: List[Dict[str, Any]], imported_items: List[Dict[str, Any]], deduplicate: bool = True) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Merges newly imported items with active vault items.
    Returns: (merged_list, added_count, updated_count)
    """
    merged = list(existing_items)
    added_count = 0
    updated_count = 0

    if not deduplicate:
        merged.extend(imported_items)
        return merged, len(imported_items), 0

    # Build quick lookup by (title_lower, username_lower)
    existing_map = {}
    for idx, item in enumerate(merged):
        key = (item.get("title", "").strip().lower(), item.get("username", "").strip().lower())
        existing_map[key] = idx

    for new_item in imported_items:
        key = (new_item.get("title", "").strip().lower(), new_item.get("username", "").strip().lower())
        if key in existing_map:
            # Update password and supplementary fields if existing one had blanks
            target_idx = existing_map[key]
            merged[target_idx]["password"] = new_item["password"]
            if new_item.get("url") and not merged[target_idx].get("url"):
                merged[target_idx]["url"] = new_item["url"]
            if new_item.get("totp_secret") and not merged[target_idx].get("totp_secret"):
                merged[target_idx]["totp_secret"] = new_item["totp_secret"]
            if new_item.get("notes"):
                old_notes = merged[target_idx].get("notes", "")
                if old_notes and new_item["notes"] not in old_notes:
                    merged[target_idx]["notes"] = f"{old_notes}\n{new_item['notes']}".strip()
                else:
                    merged[target_idx]["notes"] = new_item["notes"]
            merged[target_idx]["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            updated_count += 1
        else:
            merged.append(new_item)
            existing_map[key] = len(merged) - 1
            added_count += 1

    return merged, added_count, updated_count
