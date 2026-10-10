import uuid
import datetime
import json
import csv
from functools import wraps
from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.contrib import messages

from .forms import (
    ConnectForm,
    CredentialForm,
    ChangeMasterPasswordForm,
    DeleteRepoForm,
)
from .crypto import (
    encrypt_vault,
    decrypt_vault,
    InvalidMasterPasswordError,
    CorruptedVaultError,
    generate_secure_password,
)
from .github_api import (
    get_repo_file,
    update_or_create_repo_file,
    verify_repo_access,
    delete_repository,
    GitHubError,
    GitHubAuthError,
    GitHubRepoNotFoundError,
    GitHubPermissionError,
)


def require_session(view_func):
    """Decorator to protect views requiring an active Git-Pass session."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.session.get("is_authenticated"):
            messages.info(request, "Please connect with your GitHub details and master password first.")
            return redirect("gitpass:login")
        return view_func(request, *args, **kwargs)
    return wrapper


def _get_active_vault(request):
    """
    Retrieves and decrypts the user's vault items.
    If in demo mode, returns demo items stored in session.
    Otherwise fetches directly from user's GitHub repository.
    """
    if request.session.get("is_demo"):
        raw_items = request.session.get("demo_vault", [])
        return raw_items, "demo-sha"

    token = request.session["github_token"]
    owner = request.session["github_username"]
    repo = request.session["github_repo"]
    filename = request.session["github_filename"]
    master_pwd = request.session["master_password"]

    raw_content, sha = get_repo_file(token, owner, repo, filename)
    if not raw_content:
        # File is empty or uninitialized
        return [], sha

    items = decrypt_vault(raw_content, master_pwd)
    return items, sha


def _save_active_vault(request, items: list, commit_msg: str):
    """
    Encrypts and persists the vault items.
    In demo mode, saves to session.
    In live mode, encrypts with master password and commits directly to user's GitHub repository.
    """
    master_pwd = request.session["master_password"]
    encrypted_payload = encrypt_vault(items, master_pwd)

    if request.session.get("is_demo"):
        request.session["demo_vault"] = items
        request.session.modified = True
        return "demo-sha"

    token = request.session["github_token"]
    owner = request.session["github_username"]
    repo = request.session["github_repo"]
    filename = request.session["github_filename"]
    sha = request.session.get("file_sha")

    new_sha = update_or_create_repo_file(
        token=token,
        owner=owner,
        repo=repo,
        file_path=filename,
        content=encrypted_payload,
        commit_message=commit_msg,
        sha=sha,
    )
    request.session["file_sha"] = new_sha
    request.session.modified = True
    return new_sha


def login_view(request):
    """Connect to GitHub repo using PAT & Master Password."""
    if request.session.get("is_authenticated"):
        return redirect("gitpass:vault")

    if request.method == "POST":
        action = request.POST.get("action")

        # Handle quick demo mode
        if action == "demo":
            request.session.flush()
            request.session["is_authenticated"] = True
            request.session["is_demo"] = True
            request.session["github_username"] = "demo-user"
            request.session["github_repo"] = "git-pass-demo-vault"
            request.session["github_filename"] = "passwords.txt"
            request.session["master_password"] = "DemoMasterPass123!"
            request.session["demo_vault"] = [
                {
                    "id": str(uuid.uuid4()),
                    "title": "GitHub",
                    "username": "developer@github.com",
                    "password": "ghp_secure_mock_token_12345",
                    "url": "https://github.com",
                    "category": "Work",
                    "notes": "Primary work development account",
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                {
                    "id": str(uuid.uuid4()),
                    "title": "Google Workspace",
                    "username": "admin@company.com",
                    "password": "xK9!mQ7#vL2$pZ8*",
                    "url": "https://accounts.google.com",
                    "category": "Work",
                    "notes": "2FA backup codes stored offline",
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                {
                    "id": str(uuid.uuid4()),
                    "title": "ProtonMail",
                    "username": "privacy_user@proton.me",
                    "password": "T7@wP9$qR3!zY6#m",
                    "url": "https://mail.proton.me",
                    "category": "Personal",
                    "notes": "Encrypted personal email",
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
            ]
            messages.success(request, "Welcome to Demo Mode! Changes are kept in temporary session memory.")
            return redirect("gitpass:vault")

        form = ConnectForm(request.POST)
        if form.is_valid():
            username = form.cleaned_data["username"].strip()
            repo_name = form.cleaned_data["repo_name"].strip()
            filename = form.cleaned_data["filename"].strip()
            token = form.cleaned_data["token"].strip()
            master_pwd = form.cleaned_data["master_password"]

            try:
                # 1. Verify repository access
                verify_repo_access(token, username, repo_name)

                # 2. Fetch target file
                raw_content, file_sha = get_repo_file(token, username, repo_name, filename)

                if raw_content:
                    # 3. Existing file - attempt decryption
                    try:
                        decrypt_vault(raw_content, master_pwd)
                    except InvalidMasterPasswordError:
                        messages.error(
                            request,
                            "Incorrect master password! Could not decrypt existing repository data."
                        )
                        return render(request, "gitpass/login.html", {"form": form})
                    except CorruptedVaultError as e:
                        messages.error(
                            request,
                            f"Vault file error: {e}. Check that '{filename}' is formatted by Git-Pass."
                        )
                        return render(request, "gitpass/login.html", {"form": form})
                else:
                    # 4. File is brand new or empty - initialize encrypted repository file
                    initial_encrypted = encrypt_vault([], master_pwd)
                    file_sha = update_or_create_repo_file(
                        token=token,
                        owner=username,
                        repo=repo_name,
                        file_path=filename,
                        content=initial_encrypted,
                        commit_message="Git-Pass: Initialize encrypted password vault",
                        sha=file_sha,
                    )

                # 5. Set session (zero database persistence!)
                request.session.flush()
                request.session["is_authenticated"] = True
                request.session["is_demo"] = False
                request.session["github_username"] = username
                request.session["github_repo"] = repo_name
                request.session["github_filename"] = filename
                request.session["github_token"] = token
                request.session["master_password"] = master_pwd
                request.session["file_sha"] = file_sha

                messages.success(
                    request,
                    f"Connected to {username}/{repo_name}! Passwords are encrypted on your GitHub repo."
                )
                return redirect("gitpass:vault")

            except (GitHubAuthError, GitHubRepoNotFoundError, GitHubPermissionError, GitHubError) as e:
                messages.error(request, str(e))
                return render(request, "gitpass/login.html", {"form": form})
    else:
        form = ConnectForm()

    return render(request, "gitpass/login.html", {"form": form})


def instructions_view(request):
    """Step-by-step setup guide for GitHub repo, PAT, and Git-Pass."""
    return render(request, "gitpass/instructions.html")


@require_session
def vault_view(request):
    """Main password vault dashboard."""
    try:
        items, sha = _get_active_vault(request)
        request.session["file_sha"] = sha
    except InvalidMasterPasswordError:
        messages.error(request, "Master password validation failed. Please reconnect.")
        return redirect("gitpass:logout")
    except GitHubError as e:
        messages.error(request, f"Error synchronizing with GitHub: {e}")
        items = []

    # Filter and search
    search_q = request.GET.get("q", "").strip().lower()
    selected_cat = request.GET.get("category", "").strip()

    filtered_items = items
    if search_q:
        filtered_items = [
            i for i in filtered_items
            if search_q in i.get("title", "").lower()
            or search_q in i.get("username", "").lower()
            or search_q in i.get("url", "").lower()
            or search_q in i.get("notes", "").lower()
        ]
    if selected_cat and selected_cat != "All":
        filtered_items = [i for i in filtered_items if i.get("category") == selected_cat]

    # Analytics / Security stats
    categories = sorted(list(set(i.get("category", "Logins") for i in items)))
    total_count = len(items)
    weak_count = sum(1 for i in items if len(i.get("password", "")) < 12)

    cred_form = CredentialForm()
    pw_change_form = ChangeMasterPasswordForm()
    delete_repo_form = DeleteRepoForm()

    context = {
        "items": filtered_items,
        "total_count": total_count,
        "weak_count": weak_count,
        "categories": categories,
        "selected_cat": selected_cat or "All",
        "search_q": search_q,
        "cred_form": cred_form,
        "pw_change_form": pw_change_form,
        "delete_repo_form": delete_repo_form,
        "github_username": request.session.get("github_username"),
        "github_repo": request.session.get("github_repo"),
        "github_filename": request.session.get("github_filename"),
        "is_demo": request.session.get("is_demo", False),
    }
    return render(request, "gitpass/vault.html", context)


@require_session
def add_item_view(request):
    """Add a new credential and commit to GitHub."""
    if request.method == "POST":
        form = CredentialForm(request.POST)
        if form.is_valid():
            try:
                items, _ = _get_active_vault(request)
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                new_item = {
                    "id": str(uuid.uuid4()),
                    "title": form.cleaned_data["title"].strip(),
                    "username": form.cleaned_data["username"].strip(),
                    "password": form.cleaned_data["password"],
                    "url": form.cleaned_data.get("url", "").strip(),
                    "category": form.cleaned_data.get("category", "Logins"),
                    "notes": form.cleaned_data.get("notes", "").strip(),
                    "created_at": now_str,
                    "updated_at": now_str,
                }
                items.append(new_item)
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Pass: Add credential for {new_item['title']}"
                )
                messages.success(request, f"Saved credential '{new_item['title']}' to your GitHub repository.")
            except Exception as e:
                messages.error(request, f"Failed to save credential: {e}")
    return redirect("gitpass:vault")


@require_session
def edit_item_view(request, item_id: str):
    """Edit an existing credential and commit to GitHub."""
    try:
        items, _ = _get_active_vault(request)
    except Exception as e:
        messages.error(request, f"Error retrieving vault: {e}")
        return redirect("gitpass:vault")

    target_item = next((i for i in items if i.get("id") == item_id), None)
    if not target_item:
        messages.error(request, "Credential item not found.")
        return redirect("gitpass:vault")

    if request.method == "POST":
        form = CredentialForm(request.POST)
        if form.is_valid():
            try:
                target_item["title"] = form.cleaned_data["title"].strip()
                target_item["username"] = form.cleaned_data["username"].strip()
                target_item["password"] = form.cleaned_data["password"]
                target_item["url"] = form.cleaned_data.get("url", "").strip()
                target_item["category"] = form.cleaned_data.get("category", "Logins")
                target_item["notes"] = form.cleaned_data.get("notes", "").strip()
                target_item["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Pass: Update credential for {target_item['title']}"
                )
                messages.success(request, f"Updated '{target_item['title']}' on GitHub.")
            except Exception as e:
                messages.error(request, f"Failed to update credential: {e}")
            return redirect("gitpass:vault")
    else:
        form = CredentialForm(initial=target_item)

    return render(request, "gitpass/edit_item.html", {"form": form, "item": target_item})


@require_session
def delete_item_view(request, item_id: str):
    """Delete a credential and commit update to GitHub."""
    if request.method == "POST":
        try:
            items, _ = _get_active_vault(request)
            target = next((i for i in items if i.get("id") == item_id), None)
            if target:
                items = [i for i in items if i.get("id") != item_id]
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Pass: Remove credential for {target.get('title', 'item')}"
                )
                messages.success(request, f"Deleted '{target.get('title')}' from your repository.")
            else:
                messages.warning(request, "Credential not found.")
        except Exception as e:
            messages.error(request, f"Failed to delete credential: {e}")
    return redirect("gitpass:vault")


@require_session
def change_master_password_view(request):
    """Re-encrypt the entire repository vault file with a new master password."""
    if request.method == "POST":
        form = ChangeMasterPasswordForm(request.POST)
        if form.is_valid():
            current_pwd = form.cleaned_data["current_password"]
            new_pwd = form.cleaned_data["new_password"]

            if current_pwd != request.session.get("master_password"):
                messages.error(request, "Incorrect current master password.")
                return redirect("gitpass:vault")

            try:
                items, _ = _get_active_vault(request)
                # Update master password in session
                request.session["master_password"] = new_pwd
                _save_active_vault(
                    request,
                    items,
                    commit_msg="Git-Pass: Re-encrypt vault with new master password"
                )
                messages.success(request, "Master password changed! Vault was re-encrypted on GitHub.")
            except Exception as e:
                messages.error(request, f"Failed to change master password: {e}")
    return redirect("gitpass:vault")


@require_session
def delete_repo_view(request):
    """Permanently delete user's GitHub repository."""
    if request.session.get("is_demo"):
        request.session.flush()
        messages.success(request, "Demo session deleted successfully.")
        return redirect("gitpass:login")

    if request.method == "POST":
        form = DeleteRepoForm(request.POST)
        if form.is_valid():
            entered_repo = form.cleaned_data["confirm_repo_name"].strip()
            current_repo = request.session.get("github_repo")
            current_owner = request.session.get("github_username")
            token = request.session.get("github_token")

            if entered_repo.lower() != current_repo.lower():
                messages.error(
                    request,
                    f"Repository name mismatch. You typed '{entered_repo}', but expected '{current_repo}'."
                )
                return redirect("gitpass:vault")

            try:
                delete_repository(token, current_owner, current_repo)
                request.session.flush()
                messages.success(
                    request,
                    f"Repository '{current_owner}/{current_repo}' was permanently deleted from GitHub. "
                    "All your encrypted data has been removed."
                )
                return redirect("gitpass:login")
            except Exception as e:
                messages.error(request, f"Failed to delete repository from GitHub: {e}")

    return redirect("gitpass:vault")


@require_session
def export_vault_view(request):
    """Export decrypted passwords as a JSON or CSV file download."""
    export_format = request.GET.get("format", "json").lower()
    try:
        items, _ = _get_active_vault(request)
    except Exception as e:
        messages.error(request, f"Error exporting vault: {e}")
        return redirect("gitpass:vault")

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    if export_format == "csv":
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="gitpass_vault_{timestamp}.csv"'
        writer = csv.writer(response)
        writer.writerow(["Title", "Username", "Password", "URL", "Category", "Notes", "Updated At"])
        for item in items:
            writer.writerow([
                item.get("title", ""),
                item.get("username", ""),
                item.get("password", ""),
                item.get("url", ""),
                item.get("category", ""),
                item.get("notes", ""),
                item.get("updated_at", ""),
            ])
        return response
    else:
        response = HttpResponse(
            json.dumps(items, indent=2),
            content_type="application/json"
        )
        response["Content-Disposition"] = f'attachment; filename="gitpass_vault_{timestamp}.json"'
        return response


@require_session
def raw_vault_view(request):
    """View the exact encrypted payload currently stored in GitHub."""
    if request.session.get("is_demo"):
        items = request.session.get("demo_vault", [])
        master_pwd = request.session.get("master_password")
        raw_text = encrypt_vault(items, master_pwd)
    else:
        token = request.session["github_token"]
        owner = request.session["github_username"]
        repo = request.session["github_repo"]
        filename = request.session["github_filename"]
        raw_text, _ = get_repo_file(token, owner, repo, filename)

    return render(request, "gitpass/raw_vault.html", {
        "raw_text": raw_text,
        "filename": request.session.get("github_filename"),
        "repo": request.session.get("github_repo"),
    })


def api_generate_password(request):
    """API endpoint to generate cryptographically strong passwords."""
    try:
        length = int(request.GET.get("length", 18))
    except ValueError:
        length = 18
    use_symbols = request.GET.get("symbols", "true").lower() == "true"
    use_digits = request.GET.get("digits", "true").lower() == "true"

    pwd = generate_secure_password(length, use_symbols, use_digits)
    return JsonResponse({"password": pwd})


def logout_view(request):
    """Clears the session and disconnects from GitHub."""
    request.session.flush()
    messages.info(request, "Disconnected. Your master password and credentials have been cleared from memory.")
    return redirect("gitpass:login")


def health_view(request):
    """Health check endpoint for Render."""
    return JsonResponse({"status": "healthy", "service": "Git-Pass", "zero_server_storage": True})
