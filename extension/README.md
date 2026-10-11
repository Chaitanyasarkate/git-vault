# Git-Vault Browser WebExtension (Manifest V3)

A privacy-focused browser extension for **Git-Vault** that enables you to save, view, and generate passwords with zero server retention, directly synced with your private GitHub repository and hosted on [git-vault.onrender.com](https://git-vault.onrender.com/).

---

## Key Features

1. **Zero Server Storage**: Directly communicates with GitHub's REST API (`api.github.com`) using your Personal Access Token (PAT).
2. **Client-Side AES-256-GCM Encryption**: Data is encrypted using PBKDF2HMAC-SHA256 (120,000 rounds) and AES-256-GCM via the native Web Crypto API. Fully interoperable with the Git-Vault web dashboard.
3. **Current Site Detection**: Automatically detects the domain of the active tab (e.g. `github.com`, `google.com`) and pins matching credentials to the top.
4. **1-Click Quick Save**: Auto-fills the current site domain and URL with a single click.
5. **Cryptographic Password Generator**: Built-in high-entropy password generator with customizable length, symbols, and character sets.
6. **Autofill Integration**: Supports 1-click credential filling on web forms.
7. **Instant Demo Mode**: Test the extension UI and workflow instantly without entering GitHub credentials.
8. **Render Cloud Connectivity**: Real-time connectivity monitor and 1-click navigation to [git-vault.onrender.com](https://git-vault.onrender.com/).

---

## How to Install in Your Browser

This extension uses **Manifest V3** and works on all Chromium-based browsers (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**, **Vivaldi**) and **Firefox**.

### Google Chrome & Brave Browser
1. Open your browser and navigate to `chrome://extensions/` (or `brave://extensions/`).
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button in the top left corner.
4. Select the `extension` folder inside this project:
   `c:\Users\chaitanya sarkate\OneDrive\Desktop\Projects\vaultx\extension`
5. The **Git-Vault** extension icon will appear in your browser toolbar! Click the Extensions puzzle piece icon and pin Git-Vault for easy access.

### Microsoft Edge
1. Navigate to `edge://extensions/`.
2. Toggle on **Developer mode** in the left sidebar.
3. Click **Load unpacked**.
4. Select the `extension` folder.

### Firefox (Temporary Add-on)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside the `extension` folder.

---

## How to Use

1. Click the **Git-Vault** icon in your browser toolbar.
2. Enter your **GitHub Username**, **Repository Name**, **Personal Access Token (PAT)**, and **Master Password**.
   - Or click **⚡ Quick Instant Demo** to test immediately.
3. Once unlocked:
   - Browse your saved credentials with 1-click **Copy Username** and **Copy Password**.
   - Click **+ Add Password** to save a new credential (current tab URL is automatically detected).
   - Use the **⚡ Generator** tab to create strong passwords.
   - Click the link icon in the top header or the **Render Live** status badge to open your hosted dashboard at `https://git-vault.onrender.com/`.
4. When finished, click the **Lock** button in the top header. Your master password is removed from memory.

---

## Connectivity with git-vault.onrender.com

- **Shared GitHub Cloud Storage**: Both the extension and [git-vault.onrender.com](https://git-vault.onrender.com/) use identical Zero-Knowledge AES-256-GCM + PBKDF2 encryption. Any credential saved in the extension is committed to your GitHub repository and immediately accessible in the Render web app (and vice-versa via 1-Click Cloud Sync).
- **Live Cloud Health Ping**: The extension actively checks and displays the live health status of `git-vault.onrender.com`.
- **Intelligent Protection**: Form auto-capture automatically avoids capturing master passphrases when interacting with Git-Vault itself.
