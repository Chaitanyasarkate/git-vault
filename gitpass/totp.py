"""
Git-Vault Built-in 2FA / TOTP Authenticator Engine.
Implements RFC 6238 (TOTP) and RFC 4226 (HOTP) using HMAC-SHA1.
Generates live rolling 6-digit two-factor authentication codes.
"""

import time
import hmac
import hashlib
import struct
import base64
import urllib.parse
import re


def clean_base32_secret(secret_or_uri: str) -> str:
    """
    Cleans and extracts a base32 TOTP secret from either raw text
    or a full otpauth:// URI.
    """
    if not secret_or_uri:
        return ""

    secret_or_uri = secret_or_uri.strip()

    # Check if user provided an otpauth://totp URI
    if secret_or_uri.startswith("otpauth://"):
        parsed = urllib.parse.urlparse(secret_or_uri)
        query_params = urllib.parse.parse_qs(parsed.query)
        if "secret" in query_params:
            secret_or_uri = query_params["secret"][0]

    # Remove spaces and hyphens, convert to uppercase
    clean = re.sub(r"[\s\-]", "", secret_or_uri).upper()
    return clean


def generate_totp_code(secret_or_uri: str, time_step: int = 30, digits: int = 6) -> dict:
    """
    Generates a live 6-digit TOTP code and countdown seconds remaining.
    Returns:
    {
        "code": "482019",
        "seconds_remaining": 22,
        "valid": True,
        "error": None
    }
    """
    secret = clean_base32_secret(secret_or_uri)
    now = int(time.time())
    seconds_remaining = time_step - (now % time_step)

    if not secret:
        return {
            "code": "",
            "seconds_remaining": 0,
            "valid": False,
            "error": "Empty secret"
        }

    # Add missing base32 padding if needed
    missing_padding = len(secret) % 8
    if missing_padding != 0:
        secret += "=" * (8 - missing_padding)

    try:
        key = base64.b32decode(secret, casefold=True)
    except Exception as e:
        return {
            "code": "",
            "seconds_remaining": seconds_remaining,
            "valid": False,
            "error": f"Invalid Base32 secret: {e}"
        }

    # Counter = Unix time // time_step
    counter = now // time_step
    counter_bytes = struct.pack(">Q", counter)

    # HMAC-SHA1
    mac = hmac.new(key, counter_bytes, hashlib.sha1).digest()

    # Dynamic truncation
    offset = mac[-1] & 0x0F
    code_int = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    totp = str(code_int % (10**digits)).zfill(digits)

    return {
        "code": totp,
        "seconds_remaining": seconds_remaining,
        "valid": True,
        "error": None
    }
