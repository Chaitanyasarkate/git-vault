# 🔐 Git-Vault

> **Zero-Knowledge, Zero-Server-Storage Password Manager & Authenticator**  
> Encrypts your credentials client-side with AES-256-GCM and syncs directly with your private GitHub repository.

[![Live Deployment](https://img.shields.io/badge/Live%20Website-git--vault.onrender.com-brightgreen?style=for-the-badge&logo=render)](https://git-vault.onrender.com)
[![Framework](https://img.shields.io/badge/Framework-Django%205-092e20?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM%20%7C%20PBKDF2-blue?style=for-the-badge)](https://git-vault.onrender.com)
[![Storage](https://img.shields.io/badge/Storage-GitHub%20Repository-black?style=for-the-badge&logo=github)](https://github.com)
[![CI Tests](https://img.shields.io/badge/Tests-23%20Passing-success?style=for-the-badge)](https://github.com)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable%20App-00bcd4?style=for-the-badge)](https://git-vault.onrender.com)
[![Extension](https://img.shields.io/badge/Browser%20Extension-Manifest%20V3-orange?style=for-the-badge)](https://github.com/Chaitanyasarkate/git-vault/tree/main/extension)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

---

## 🌟 Overview

**Git-Vault** is a privacy-first, zero-server-storage password manager and 2FA authenticator designed for individuals and developers who demand total sovereignty over their personal data.

Unlike traditional password managers that store your encrypted data on their proprietary cloud databases, Git-Vault stores **zero passwords, zero tokens, and zero user data on its server**. Instead, your vault is encrypted with your master password using military-grade authenticated cryptography and committed directly to a **private GitHub repository that you own**.

Even if the Git-Vault server were compromised, an attacker would obtain **nothing**: no databases exist, no files are stored, and no master passwords ever persist in server memory.

---

## 🛡️ Core Architecture & Cryptography

```
                    ┌────────────────────────────────────────┐
                    │          User Master Password          │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │           PBKDF2HMAC-SHA256            │
                    │      120,000 Rounds + 32-Byte Salt     │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │      Derived 256-Bit AES Key (AEAD)    │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │           AES-256-GCM Engine           │
                    │   12-Byte Nonce + 16-Byte Auth Tag     │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │       "git-vault-aes256gcm" JSON       │
                    └───────────────────┬────────────────────┘
                                        │
                        Direct HTTPS commit via GitHub API
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │   User's Private GitHub Repository     │
                    │    (e.g., username/my-vault:data.txt)  │
                    │                                        │
                    │   [0 PASSWORDS STORED ON BACKEND DB]   │
                    └────────────────────────────────────────┘
```

### Cryptographic Envelope Specification
Every vault update written to your GitHub repository adheres to the authenticated JSON envelope schema:

```json
{
  "format": "git-vault-aes256gcm",
  "version": 1,
  "kdf": "PBKDF2HMAC-SHA256",
  "iterations": 120000,
  "salt": "base64-encoded-32-byte-salt",
  "nonce": "base64-encoded-12-byte-nonce",
  "ciphertext": "base64-encoded-aes-gcm-ciphertext-with-tag"
}
```

- **AEAD Authenticated Encryption**: AES-256-GCM guarantees both confidentiality and tamper detection. If any bit of the ciphertext is modified in GitHub, decryption immediately fails with an authentication tag error.
- **Key Derivation (KDF)**: PBKDF2HMAC with SHA-256 and 120,000 iterations dramatically increases brute-force protection costs.
- **Unique Nonces**: A fresh cryptographically secure random 12-byte nonce (`os.urandom` / `crypto.getRandomValues`) is generated on every single write operation.
- **Stateless Server Sessions**: Sessions use signed, encrypted browser cookies (`signed_cookies`). Memory is flushed on disconnect or 30 minutes of inactivity.

---

## ✨ Features

### 1. Zero-Knowledge Dashboard & Credential Management
- **Full Credential Lifecycle**: Add, view, edit, and delete credentials (Title, Username/Email, Password, Category, Website URL, 2FA Secret Key, and Recovery Notes).
- **Instant Search & Category Filtering**: Instantly search titles, usernames, and URLs; filter by `Logins`, `Social`, `Work`, `Finance`, or `Personal`.
- **1-Click Clipboard Copying**: Instant 1-click copy buttons for usernames, passwords, and TOTP codes with visual feedback toasts.
- **1-Click Bulk Password Importer**: Import your complete password library from **Google Chrome**, **Bitwarden**, **Mozilla Firefox**, **1Password**, or **LastPass** in under 2 seconds. Merges without duplicates and encrypts under your Master Password.
- **Progressive Web App (PWA) Support**: Install Git-Vault directly onto your **Windows taskbar**, **macOS dock**, **Android**, or **iPhone home screen** as a standalone application with fast offline shell caching.
- **Power-User Keyboard Shortcuts**: Press `/` to focus search instantly, `Alt + N` to create a credential, and `Esc` to close modals.
- **Transparent Ciphertext Inspection**: Inspect the raw, unmodified base64 ciphertext stored in your GitHub repository anytime via `/vault/raw/`.
- **Master Password Re-encryption**: Rotate your master password at any time. Git-Vault automatically re-encrypts all credentials under the new key and commits the updated file to GitHub.
- **Offline Data Portability**: Export your decrypted vault to formatted JSON or CSV anytime for local backups.
- **Self-Sovereign Repository Deletion**: Exercise your right to be forgotten—delete your repository directly from the Git-Vault settings via GitHub API.
- **Interactive Demo Mode**: Test drive all features and simulated commits without entering your real GitHub credentials.

### 2. 🛡️ Breach Health Audit & Password Strength Dashboard
- **k-Anonymity Model**: Implements HaveIBeenPwned's range API. Only the first 5 characters of a SHA-1 hash are sent over the wire; your actual password is never shared with third parties.
- **Overall Vault Health Score**: Real-time score from 0 to 100 based on password entropy, reuse, and breach history.
- **At-a-Glance Badges**: Instantly highlights compromised passwords, weak passphrases, and shared credentials across accounts.

### 3. ⏱️ Built-in 2FA / TOTP Authenticator Engine
- **Standard Compliant**: Full implementation of RFC 6238 (TOTP) and RFC 4226 (HOTP) using HMAC-SHA1.
- **Live Rolling 6-Digit Codes**: Live ticking countdown timer and visual progress bar that regenerates one-time passwords every 30 seconds.
- **Universal Input**: Accepts raw Base32 secret keys (e.g., `JBSWY3DPEHPK3PXP`) or complete `otpauth://totp/...` URIs.

### 4. ⏳ Commit Time-Machine & Rollback Engine
- **Git Commit Timeline**: Live view of historical commits made to your vault file directly from GitHub's Git tree.
- **1-Click Historical Rollback**: Restore your vault to any past commit in one click if a password was accidentally modified or deleted.

---

## 🧩 Browser WebExtension (Manifest V3)

The project includes a full-featured browser WebExtension in the [`extension/`](extension/) directory for Chromium browsers (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**) and **Mozilla Firefox**.

### Extension Features:
1. **Direct GitHub Synchronization**: Talks directly to `api.github.com` via your PAT—does not require the Django server to be running.
2. **Native Web Crypto API**: Implements client-side PBKDF2 and AES-256-GCM interoperable with the Python backend.
3. **Smart Site Detection**: Automatically detects the active browser tab domain (e.g. `github.com`) and pins relevant credentials to the top.
4. **Intelligent Auto-Capture**: Detects login form submissions on web pages and displays a floating HUD badge asking if you want to save the new credentials to Git-Vault.
5. **WebAuthn Biometric Unlock**: Securely enroll and unlock your extension using **Windows Hello**, **Touch ID**, or hardware security keys without typing your master password every time.
6. **Embedded Password Generator**: Create cryptographically random 10–40 character passwords with custom character sets directly from the browser popup.

### Installing the Extension:
1. Open your browser and navigate to:
   - **Chrome / Brave**: `chrome://extensions/`
   - **Microsoft Edge**: `edge://extensions/`
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the [`extension/`](extension/) directory inside this project:
   ```
   path/to/git-vault/extension
   ```
5. Pin the **Git-Vault** shield icon to your browser toolbar.

---

## 📋 Getting Started Guide

### 1. GitHub Account & Token Setup
1. Create a free account at [github.com](https://github.com) if you do not have one.
2. Generate a Personal Access Token (Classic) at [GitHub Token Settings](https://github.com/settings/tokens/new?scopes=repo,delete_repo):
   - Scope **`repo`** *(Required)*: Grants read and write access to your encrypted vault file.
   - Scope **`delete_repo`** *(Optional)*: Only needed if you want the ability to delete your repository directly from the app.
3. Copy your Personal Access Token (starts with `ghp_`).

### 2. Create a Dedicated Vault Repository
1. Create a new repository on GitHub (e.g., `my-passwords-vault` or `git-vault-data`).
2. Set the repository visibility to **Private**.
3. Add any initial file (e.g., `passwords.txt` or `data.json`). The file can be empty; Git-Vault will automatically format and initialize it upon first connect.

### 3. Connect to Git-Vault
1. Open Git-Vault and enter your:
   - **GitHub Username**
   - **Repository Name**
   - **Filename** (e.g. `passwords.txt`)
   - **Personal Access Token**
   - **Master Password**
2. Click **Connect & Unlock Vault**.

---

## 🚀 Local Development Setup

### Prerequisites
- Python 3.11+
- Git

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/Chaitanyasarkate/git-vault.git
cd git-vault

# 2. Create and activate virtual environment
# Windows:
python -m venv venv
.\venv\Scripts\activate

# Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run database migrations and collect static files
python manage.py migrate
python manage.py collectstatic --no-input

# 5. Run the automated test suite
python manage.py test

# 6. Start the local development server
python manage.py runserver
```

Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## ☁️ Deployment Guide

Because Git-Vault does not retain server-side state or store passwords in an external database, deployment is completely frictionless and runs seamlessly on free-tier hosting.

### Option 1: Render.com (Recommended)
This repository is pre-configured with [`render.yaml`](render.yaml) and [`build.sh`](build.sh).

1. Push your repository to GitHub.
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** &rarr; **Blueprint** and select this repository.
4. Render will automatically parse `render.yaml` and deploy:
   - **Build Command**: `./build.sh`
   - **Start Command**: `gunicorn gitpass_project.wsgi:application`
   - **Health Check Path**: `/health/`
5. Your app will be live at `https://git-vault.onrender.com` with free automated SSL!


### Environment Variables Reference

| Variable | Description | Default | Required in Production |
| :--- | :--- | :--- | :--- |
| `DJANGO_SECRET_KEY` | Cryptographic key used to sign session cookies | Dev fallback key | **Yes** |
| `DEBUG` | Django debug mode (`True` or `False`) | `True` | **No** (Set to `False`) |
| `ALLOWED_HOSTS` | Comma-separated list of allowed hostnames | `*` | **Yes** |
| `PYTHON_VERSION` | Runtime Python version | `3.11.8` | Recommended |

---

## 📁 Repository Directory Structure

```text
git-vault/
├── .github/
│   └── workflows/
│       └── ci.yml                # Automated CI test suite
├── extension/                    # Manifest V3 Browser WebExtension
│   ├── background.js             # Service worker
│   ├── content.js                # Form autofill & auto-capture listener
│   ├── crypto.js                 # Web Crypto API AES-256-GCM engine
│   ├── github.js                 # GitHub REST API client
│   ├── manifest.json             # Extension manifest specification
│   ├── popup.html                # Luxury dark glassmorphism popup UI
│   ├── popup.css                 # Responsive popup styles
│   ├── popup.js                  # Extension controller & biometric unlock
│   └── README.md                 # Extension installation instructions
├── gitpass/                      # Core Django Application
│   ├── crypto.py                 # AES-256-GCM & PBKDF2 encryption engine
│   ├── forms.py                  # Form validation & security sanitization
│   ├── github_api.py             # GitHub REST API integration client
│   ├── security_audit.py         # k-Anonymity breach audit engine
│   ├── tests.py                  # Full test suite (18 unit/integration tests)
│   ├── totp.py                   # RFC 6238 2FA/TOTP rolling code engine
│   ├── urls.py                   # App URL routing
│   └── views.py                  # Controllers & session state management
├── gitpass_project/              # Django Project Configuration
│   ├── settings.py               # Security headers, cookies, WhiteNoise
│   ├── urls.py                   # Root URL routing
│   └── wsgi.py                   # WSGI entrypoint for Gunicorn
├── static/
│   ├── css/gitpass.css           # Custom dark cyberpunk styling & responsive rules
│   └── js/gitpass.js             # Interactive search, copy, and UI engine
├── templates/
│   ├── base.html                 # Master template with navigation & alerts
│   └── gitpass/
│       ├── edit_item.html        # Credential editing interface
│       ├── instructions.html     # Setup instructions guide
│       ├── login.html            # Sign-in & repository connection view
│       ├── raw_vault.html        # Direct raw ciphertext viewer
│       └── vault.html            # Main vault dashboard & health metrics
├── build.sh                      # Render.com build script
├── Procfile                      # Production process specification
├── render.yaml                   # 1-click Render blueprint configuration
├── requirements.txt              # Production Python dependencies
├── .env.example                  # Sample environment variable template
└── README.md                     # Comprehensive documentation
```

---

## 🔒 Security Guarantees & Threat Model

| Risk / Threat | Git-Vault Mitigation |
| :--- | :--- |
| **Server Compromise / SQL Injection** | **Immune**. Git-Vault has zero database storage. No user passwords or tokens exist on the server. |
| **Man-in-the-Middle (MITM)** | **Protected**. All communication with GitHub occurs over TLS 1.3 with authenticated tokens. |
| **GitHub Data Leak / Public Repo** | **Protected**. The repository file contains only authenticated ciphertext (`AES-256-GCM`). Without the master password, data is indistinguishable from random noise. |
| **Tampered Ciphertext in Git** | **Protected**. GCM authentication tag validation detects any unauthorized modifications and halts decryption. |
| **Brute-Force Attacks** | **Hardened**. PBKDF2HMAC-SHA256 with 120,000 iterations dramatically increases computational cost for dictionary attacks. |
| **Session Hijacking** | **Protected**. Ephemeral sessions expire after 30 minutes of inactivity and are signed using HTTPOnly, Secure, SameSite cookies. |

---

## 🧪 Testing

Git-Vault maintains a test suite covering cryptography, envelope integrity, views, and error scenarios.

```bash
python manage.py test
```

```text
Creating test database for alias 'default'...
..................
----------------------------------------------------------------------
Ran 18 tests in 0.521s

OK
Destroying test database for alias 'default'...
```

---

## 📜 License

This project is licensed under the **MIT License**. You are free to inspect, modify, host, and distribute this software for personal or commercial purposes.
