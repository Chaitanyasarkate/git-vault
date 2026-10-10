# 🔐 Git-Pass

> **A privacy-focused password manager**

[![Live Deployment](https://img.shields.io/badge/Live%20Website-git--pass.onrender.com-brightgreen?style=for-the-badge&logo=render)](https://git-pass.onrender.com)
[![Framework](https://img.shields.io/badge/Framework-Django%205-092e20?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM%20%7C%20PBKDF2-blue?style=for-the-badge)](https://git-pass.onrender.com)
[![Storage](https://img.shields.io/badge/Storage-GitHub%20Repository-black?style=for-the-badge&logo=github)](https://github.com)
[![CI Tests](https://img.shields.io/badge/Tests-13%20Passing-success?style=for-the-badge)](https://github.com)

---

## 🌟 Overview

**Git-pass** uses the master password obtained from the user to encrypt user's passwords.

These encrypted passwords are stored in a **GitHub repository provided by the user**, giving complete access of user's data to only themselves.

- 🔒 **Zero Server Storage**: Git-pass does not store any passwords on its backend server.
- 🗑️ **User Sovereignty**: User repositories can be deleted by the user at anytime directly through Git-pass or GitHub.
- 🔑 **Master Key Derivation**: High-entropy PBKDF2HMAC (SHA-256, 120,000 iterations) with authenticated AES-256-GCM ciphertexts.
- 🚀 **Cloud Ready**: Production-ready deployment blueprint for **Render.com**.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11+, Django 5, Gunicorn
- **Static Assets**: WhiteNoise
- **Cryptography**: `cryptography` (AES-256-GCM + PBKDF2HMAC-SHA256)
- **External Storage**: GitHub REST API
- **Deployment**: Render.com Web Service (`git-pass.onrender.com`)

```text
User Master Password
        ↓
  PBKDF2HMAC-SHA256 (120,000 iterations + Salt)
        ↓
   Derived Key (256-bit)
        ↓
   AES-256-GCM Encryption (with 12-byte Nonce & Auth Tag)
        ↓
  Encrypted Ciphertext
        ↓
  Direct Commit via GitHub API (User's Private GitHub Repo)
  [0 PASSWORDS STORED ON BACKEND SERVER]
```

---

## ✨ Features

- **Personal GitHub Storage**: Store passwords in any repository file (e.g. `passwords.txt`, `data.json`, `vault.dat`).
- **AES-256-GCM Cryptographic Security**: Authenticated encryption ensures your ciphertext cannot be tampered with.
- **Zero Server Retention**: No database holds your master password, PAT, or password items. Signed ephemeral sessions keep your memory secure.
- **Instant Search & Category Filtering**: Filter by category (Logins, Social, Work, Finance, Personal) and live search in real time.
- **Cryptographic Password Generator**: Generate high-entropy secure passwords with custom lengths and symbol toggles.
- **One-Click Clipboard Copying**: Instant copy for usernames and passwords with feedback toasts.
- **Master Password Re-encryption**: Change your master password at any time—Git-Pass automatically re-encrypts all items and commits the new vault to GitHub.
- **Complete Repository Deletion**: Exercise your right to erase your data—delete your repository directly via GitHub API.
- **Encrypted Payload Transparency**: View the exact raw ciphertext currently in GitHub via `/vault/raw/`.
- **Offline Export**: Download your decrypted vault anytime in JSON or CSV format.
- **Interactive Demo Mode**: Test the complete vault experience instantly without entering personal credentials.

---

## 📋 Setup Instructions

### 1. Create a GitHub Account
Create a free account at [github.com](https://github.com).

### 2. Generate a Personal Access Token (PAT)
1. Go to [GitHub Settings &gt; Developer Settings &gt; Personal Access Tokens](https://github.com/settings/tokens).
2. Generate a token with the **`repo`** scope (to read and write your encrypted file).
3. *(Optional)* Select **`delete_repo`** if you want the ability to delete your repository from Git-Pass settings.
4. Copy and store your token securely.

### 3. Create a Repository
1. Create a repository on GitHub (e.g., `my-passwords-vault`). Setting it to **Private** is recommended.
2. Initialize it by adding any file (e.g., `passwords.txt`, `data.json`, or `vault.dat`).

### 4. Connect with Git-Pass
1. Enter your GitHub Username, Repository Name, Filename, PAT, and chosen Master Password.
2. If the file is brand new, Git-Pass will automatically format and initialize your encrypted vault!

---

## 🚀 Local Development

### 1. Clone the repository
```bash
git clone https://github.com/Chaitanyasarkate/git-vault.git
cd git-vault
```

### 2. Install dependencies
```bash
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Run migrations and collect static files
```bash
python manage.py migrate
python manage.py collectstatic --no-input
```

### 4. Run tests
```bash
python manage.py test
```

### 5. Start the local server
```bash
python manage.py runserver
```
Visit **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## ☁️ Deployment on Render.com

This project is pre-configured for 1-click deployment on [Render.com](https://render.com) using `render.yaml`.

1. Fork or push this repository to GitHub.
2. In the Render Dashboard, create a **New Blueprint Instance** and select this repository.
3. Render automatically provisions the web service using `render.yaml`:
   - **Build Command**: `./build.sh`
   - **Start Command**: `gunicorn gitpass_project.wsgi:application`
   - **Health Check**: `/health/`
4. Your application will be live at `https://<your-service-name>.onrender.com`!

---

## 📜 License

MIT License. Free and open source for personal and enterprise use.
