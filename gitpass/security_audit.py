"""
Git-Vault Security Audit & Breach Detection Module.
Implements the k-Anonymity model (HaveIBeenPwned API) to check breached passwords
without ever exposing the actual password to third-party servers.
"""

import hashlib
import re
import urllib.request
import urllib.error
from collections import Counter


def check_pwned_password(password: str, timeout: float = 2.5) -> int:
    """
    Check if a password has appeared in data breaches using k-Anonymity.
    Only the first 5 characters of the SHA-1 hash are transmitted.
    Returns the number of times the password was breached, or 0 if safe/unbreached.
    """
    if not password:
        return 0

    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    url = f"https://api.pwnedpasswords.com/range/{prefix}"
    headers = {
        "User-Agent": "GitVault-ZeroKnowledge-Auditor",
        "Add-Padding": "true"  # Prevents response size analysis
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="ignore")

        for line in body.splitlines():
            parts = line.strip().split(":")
            if len(parts) == 2 and parts[0] == suffix:
                try:
                    return int(parts[1])
                except ValueError:
                    return 1
        return 0
    except (urllib.error.URLError, TimeoutError, OSError):
        # Network failure or offline mode: fail open safely without blocking
        return 0


def calculate_password_strength(password: str) -> dict:
    """
    Calculates entropy, length, complexity, and safety score for a password.
    Returns a score from 0 to 100 with qualitative rating.
    """
    if not password:
        return {"score": 0, "label": "Empty", "color": "red", "suggestions": ["Enter a password."]}

    length = len(password)
    has_lower = bool(re.search(r"[a-z]", password))
    has_upper = bool(re.search(r"[A-Z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_symbol = bool(re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]", password))

    score = 0
    suggestions = []

    # Length evaluation
    if length >= 16:
        score += 45
    elif length >= 12:
        score += 35
    elif length >= 8:
        score += 20
        suggestions.append("Increase length to 14+ characters.")
    else:
        score += 8
        suggestions.append("Password is too short (under 8 chars).")

    # Character variety
    variety_count = sum([has_lower, has_upper, has_digit, has_symbol])
    score += variety_count * 12

    if not has_upper:
        suggestions.append("Add uppercase letters.")
    if not has_digit:
        suggestions.append("Add numbers.")
    if not has_symbol:
        suggestions.append("Add special symbols.")

    # Repetition penalty
    if len(set(password)) < length * 0.5:
        score -= 15
        suggestions.append("Avoid repeating identical characters.")

    score = max(5, min(100, score))

    if score >= 80:
        label = "Very Strong"
        color = "emerald"
    elif score >= 60:
        label = "Strong"
        color = "teal"
    elif score >= 40:
        label = "Moderate"
        color = "amber"
    else:
        label = "Weak"
        color = "red"

    return {
        "score": score,
        "label": label,
        "color": color,
        "suggestions": suggestions,
    }


def audit_vault_credentials(items: list, check_breaches: bool = True) -> dict:
    """
    Audits an entire list of decrypted vault items.
    Detects:
    - Weak passwords
    - Reused passwords
    - Breached passwords via k-Anonymity
    - Overall Vault Health Score (0 - 100)
    """
    total_count = len(items)
    if total_count == 0:
        return {
            "health_score": 100,
            "grade": "A+",
            "total_count": 0,
            "breached_count": 0,
            "weak_count": 0,
            "reused_count": 0,
            "items_audit": [],
        }

    # Detect reused passwords
    passwords = [item.get("password", "") for item in items if item.get("password")]
    pwd_counts = Counter(passwords)
    reused_passwords = {pwd for pwd, count in pwd_counts.items() if count > 1}

    items_audit = []
    total_score_sum = 0
    breached_count = 0
    weak_count = 0
    reused_count = 0

    for item in items:
        pwd = item.get("password", "")
        strength = calculate_password_strength(pwd)
        is_reused = pwd in reused_passwords and len(pwd) > 0
        if is_reused:
            reused_count += 1
            strength["suggestions"].append("This password is used across multiple accounts.")

        breach_count = 0
        if check_breaches and pwd:
            breach_count = check_pwned_password(pwd)
            if breach_count > 0:
                breached_count += 1
                strength["suggestions"].insert(
                    0, f"⚠️ Found in {breach_count:,} public data breaches! Change immediately."
                )
                strength["color"] = "red"

        item_score = strength["score"]
        if breach_count > 0:
            item_score = max(5, item_score - 50)
        if is_reused:
            item_score = max(10, item_score - 25)

        if item_score < 50:
            weak_count += 1

        total_score_sum += item_score

        items_audit.append({
            "id": item.get("id"),
            "title": item.get("title", "Untitled"),
            "username": item.get("username", ""),
            "url": item.get("url", ""),
            "strength": strength,
            "is_reused": is_reused,
            "breach_count": breach_count,
            "effective_score": item_score,
        })

    average_score = round(total_score_sum / total_count)
    # Penalize overall score if breached passwords exist
    if breached_count > 0:
        average_score = max(10, average_score - (breached_count * 15))

    health_score = max(0, min(100, average_score))

    if health_score >= 90:
        grade = "A+"
    elif health_score >= 80:
        grade = "A"
    elif health_score >= 70:
        grade = "B"
    elif health_score >= 50:
        grade = "C"
    else:
        grade = "F"

    return {
        "health_score": health_score,
        "grade": grade,
        "total_count": total_count,
        "breached_count": breached_count,
        "weak_count": weak_count,
        "reused_count": reused_count,
        "items_audit": items_audit,
    }
