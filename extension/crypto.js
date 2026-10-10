/**
 * Git-Vault WebExtension Cryptographic Engine
 * Zero-Knowledge Client-Side AES-256-GCM + PBKDF2HMAC-SHA256
 * 100% Interoperable with Git-Vault Python Backend
 */

const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey using PBKDF2-SHA256 with 120,000 iterations.
 */
async function deriveKey(masterPassword, saltBuffer) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an array of credential objects into the Git-Vault JSON envelope.
 */
async function encryptVault(data, masterPassword) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await deriveKey(masterPassword, salt.buffer);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(data));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce
    },
    key,
    plaintextBytes
  );

  const envelope = {
    format: 'git-vault-aes256gcm',
    version: 1,
    kdf: 'PBKDF2HMAC-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bufferToBase64(salt.buffer),
    nonce: bufferToBase64(nonce.buffer),
    ciphertext: bufferToBase64(ciphertextBuffer)
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypts raw repository content using the master password.
 */
async function decryptVault(rawContent, masterPassword) {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  let envelope;
  try {
    envelope = JSON.parse(rawContent.trim());
  } catch (err) {
    throw new Error('Vault file is not valid JSON. Ensure it contains Git-Vault encrypted data.');
  }

  if (Array.isArray(envelope)) {
    return envelope; // Unencrypted legacy or empty array
  }

  if (!envelope || typeof envelope !== 'object' || !envelope.ciphertext) {
    throw new Error('Unrecognized vault structure in repository file.');
  }

  try {
    const saltBuffer = base64ToBuffer(envelope.salt);
    const nonceBuffer = base64ToBuffer(envelope.nonce);
    const ciphertextBuffer = base64ToBuffer(envelope.ciphertext);

    const key = await deriveKey(masterPassword, saltBuffer);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(nonceBuffer)
      },
      key,
      ciphertextBuffer
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decryptedBuffer));
  } catch (err) {
    throw new Error('Invalid master password or corrupted vault authentication tag.');
  }
}

/**
 * High-entropy cryptographic password generator.
 */
function generatePassword({ length = 20, upper = true, lower = true, numbers = true, symbols = true } = {}) {
  let chars = '';
  if (lower) chars += 'abcdefghijkmnopqrstuvwxyz';
  if (upper) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (numbers) chars += '23456789';
  if (symbols) chars += '!@#$%^&*()-_=+[]{}|;:,.<>?';

  if (!chars) chars = 'abcdefghijkmnopqrstuvwxyz23456789';

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// Export for extension modules or window
if (typeof window !== 'undefined') {
  window.GitVaultCrypto = {
    encryptVault,
    decryptVault,
    generatePassword
  };
  window.GitPassCrypto = window.GitVaultCrypto;
}
