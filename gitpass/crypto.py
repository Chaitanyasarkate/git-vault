"""
Cryptographic module for Git-Vault.
Implements zero-knowledge client/server encryption using AES-256-GCM
and PBKDF2HMAC key derivation with 120,000 rounds of SHA-256.
"""

import os
import json
import base64
import secrets
import string
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag

PBKDF2_ITERATIONS = 120_000
SALT_BYTES = 32
NONCE_BYTES = 12


class CryptoError(Exception):
    """Base exception for crypto operations."""
    pass


class InvalidMasterPasswordError(CryptoError):
    """Raised when the master password fails authentication tag validation."""
    pass


class CorruptedVaultError(CryptoError):
    """Raised when vault data structure is unparseable or corrupted."""
    pass


def _derive_key(master_password: str, salt: bytes) -> bytes:
    """Derive a 256-bit AES key from the master password and salt using PBKDF2HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(master_password.encode("utf-8"))


def encrypt_vault(data: list, master_password: str) -> str:
    """
    Encrypts a vault payload (list of dicts) with the user's master password.
    Returns a formatted JSON string containing the salt, nonce, and ciphertext (with tag).
    """
    salt = os.urandom(SALT_BYTES)
    nonce = os.urandom(NONCE_BYTES)
    key = _derive_key(master_password, salt)

    plaintext_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, None)

    envelope = {
        "format": "git-vault-aes256gcm",
        "version": 1,
        "kdf": "PBKDF2HMAC-SHA256",
        "iterations": PBKDF2_ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }
    return json.dumps(envelope, indent=2)


def decrypt_vault(raw_content: str, master_password: str) -> list:
    """
    Decrypts the raw vault content retrieved from GitHub using the user's master password.
    Returns the list of vault items.
    """
    raw_content = raw_content.strip()
    if not raw_content:
        return []

    try:
        envelope = json.loads(raw_content)
    except json.JSONDecodeError:
        # Check if file has legacy or corrupt format
        raise CorruptedVaultError("Vault file is not valid JSON. Ensure the file contains Git-Vault encrypted data.")

    if not isinstance(envelope, dict) or "ciphertext" not in envelope:
        # If it was an empty or uninitialized JSON array
        if isinstance(envelope, list):
            return envelope
        raise CorruptedVaultError("Unrecognized vault structure in repository file.")

    try:
        salt = base64.b64decode(envelope["salt"])
        nonce = base64.b64decode(envelope["nonce"])
        ciphertext = base64.b64decode(envelope["ciphertext"])
        iterations = envelope.get("iterations", PBKDF2_ITERATIONS)
    except (KeyError, ValueError, TypeError) as e:
        raise CorruptedVaultError(f"Vault envelope has missing or invalid base64 fields: {e}")

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    key = kdf.derive(master_password.encode("utf-8"))
    aesgcm = AESGCM(key)

    try:
        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    except InvalidTag:
        raise InvalidMasterPasswordError("Incorrect master password. Could not decrypt vault.")

    try:
        vault_data = json.loads(decrypted_bytes.decode("utf-8"))
        if not isinstance(vault_data, list):
            raise CorruptedVaultError("Decrypted vault payload is not a list of items.")
        return vault_data
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise CorruptedVaultError("Decrypted content could not be decoded as JSON.")


def generate_secure_password(length: int = 18, use_symbols: bool = True, use_digits: bool = True) -> str:
    """Generates a cryptographically strong random password."""
    chars = string.ascii_letters
    if use_digits:
        chars += string.digits
    if use_symbols:
        chars += "!@#$%^&*()-_=+[]{}|;:,.<>?"

    if length < 8:
        length = 8
    elif length > 128:
        length = 128

    return "".join(secrets.choice(chars) for _ in range(length))
