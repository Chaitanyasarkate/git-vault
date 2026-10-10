import uuid
import datetime
import json
import csv
import base64
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
    list_file_commits,
    get_file_at_commit,
    GitHubError,
    GitHubAuthError,
    GitHubRepoNotFoundError,
    GitHubPermissionError,
)
import os
from django.conf import settings
from .security_audit import audit_vault_credentials, calculate_password_strength
from .totp import generate_totp_code
from .importer import parse_import_file, merge_vault_items, ImportError as VaultImportError



def require_session(view_func):
    """Decorator to protect views requiring an active Git-Vault session."""
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
            request.session["github_repo"] = "git-vault-demo-vault"
            request.session["github_filename"] = "passwords.txt"
            request.session["master_password"] = "DemoMasterPass123!"
            request.session["demo_vault"] = [
                {
                    "id": str(uuid.uuid4()),
                    "title": "GitHub",
                    "username": "developer@github.com",
                    "password": "ghp_secure_mock_token_12345",
                    "totp_secret": "JBSWY3DPEHPK3PXP",
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
                    "totp_secret": "",
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
                    "totp_secret": "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ",
                    "url": "https://mail.proton.me",
                    "category": "Personal",
                    "notes": "Encrypted personal email",
                    "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
            ]
            request.session["demo_commits"] = [
                {
                    "sha": "a1b2c3d4e5f678901234567890abcdef12345678",
                    "short_sha": "a1b2c3d",
                    "message": "Git-Vault: Update ProtonMail 2FA secret",
                    "author": "demo-user",
                    "date": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=15)).isoformat(),
                },
                {
                    "sha": "f9e8d7c6b5a432109876543210fedcba87654321",
                    "short_sha": "f9e8d7c",
                    "message": "Git-Vault: Add Google Workspace credentials",
                    "author": "demo-user",
                    "date": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)).isoformat(),
                },
                {
                    "sha": "0123456789abcdef0123456789abcdef01234567",
                    "short_sha": "0123456",
                    "message": "Git-Vault: Initialize encrypted password vault",
                    "author": "demo-user",
                    "date": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat(),
                },
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
                            f"Vault file error: {e}. Check that '{filename}' is formatted by Git-Vault."
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
                        commit_message="Git-Vault: Initialize encrypted password vault",
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
    """Step-by-step setup guide for GitHub repo, PAT, and Git-Vault."""
    return render(request, "gitpass/instructions.html")


@require_session
def vault_view(request):
    """Main password vault dashboard with search, sorting, categories, groups, and trash recovery."""
    try:
        items, sha = _get_active_vault(request)
        request.session["file_sha"] = sha
    except InvalidMasterPasswordError:
        messages.error(request, "Master password validation failed. Please reconnect.")
        return redirect("gitpass:logout")
    except GitHubError as e:
        messages.error(request, f"Error synchronizing with GitHub: {e}")
        items = []

    # Separate active items from soft-deleted Trash items
    active_items = [i for i in items if not i.get("deleted_at")]
    trash_items = [i for i in items if i.get("deleted_at")]
    trash_count = len(trash_items)

    tab = request.GET.get("tab", "vault").strip().lower()
    display_items = trash_items if tab == "trash" else active_items

    # Filter by search query, category, and shared group
    search_q = request.GET.get("q", "").strip().lower()
    selected_cat = request.GET.get("category", "").strip()
    selected_group = request.GET.get("group", "").strip()
    sort_by = request.GET.get("sort", "title_asc").strip().lower()

    if search_q:
        display_items = [
            i for i in display_items
            if search_q in i.get("title", "").lower()
            or search_q in i.get("username", "").lower()
            or search_q in i.get("url", "").lower()
            or search_q in i.get("notes", "").lower()
            or search_q in i.get("group", "").lower()
        ]
    if selected_cat and selected_cat != "All":
        display_items = [i for i in display_items if i.get("category") == selected_cat]
    if selected_group and selected_group != "All":
        display_items = [i for i in display_items if i.get("group") == selected_group]

    # Sorting
    if sort_by == "title_desc":
        display_items.sort(key=lambda x: x.get("title", "").lower(), reverse=True)
    elif sort_by == "newest":
        display_items.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
    elif sort_by == "oldest":
        display_items.sort(key=lambda x: x.get("created_at") or x.get("updated_at") or "")
    elif sort_by == "category":
        display_items.sort(key=lambda x: (x.get("category", ""), x.get("title", "").lower()))
    elif sort_by == "group":
        display_items.sort(key=lambda x: (x.get("group", ""), x.get("title", "").lower()))
    elif sort_by == "weakest":
        display_items.sort(key=lambda x: len(x.get("password", "")))
    else:  # title_asc default
        display_items.sort(key=lambda x: x.get("title", "").lower())

    # Analytics / Security stats & TOTP computation
    categories = sorted(list(set(i.get("category", "Logins") for i in active_items)))
    groups = sorted(list(set(i.get("group") for i in active_items if i.get("group"))))
    total_count = len(active_items)
    weak_count = sum(1 for i in active_items if len(i.get("password", "")) < 12 and i.get("category") != "Notes")

    # Attach live TOTP generation for items with 2FA secret
    for item in display_items:
        secret = item.get("totp_secret", "")
        if secret:
            totp_res = generate_totp_code(secret)
            item["totp_code"] = totp_res["code"]
            item["totp_remaining"] = totp_res["seconds_remaining"]
            item["totp_valid"] = totp_res["valid"]
        else:
            item["totp_code"] = None
            item["totp_remaining"] = 0
            item["totp_valid"] = False

    # Quick local vault security analysis for header shield score
    audit_summary = audit_vault_credentials(active_items, check_breaches=False)

    cred_form = CredentialForm()
    pw_change_form = ChangeMasterPasswordForm()
    delete_repo_form = DeleteRepoForm()

    context = {
        "items": display_items,
        "total_count": total_count,
        "trash_count": trash_count,
        "active_tab": tab,
        "weak_count": weak_count,
        "audit_summary": audit_summary,
        "categories": categories,
        "groups": groups,
        "selected_cat": selected_cat or "All",
        "selected_group": selected_group or "All",
        "sort_by": sort_by,
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
        form = CredentialForm(request.POST, request.FILES)
        if form.is_valid():
            try:
                items, _ = _get_active_vault(request)
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

                # Process optional encrypted file attachment
                attachments = []
                att_file = request.FILES.get("attachment")
                if att_file:
                    if att_file.size <= 500 * 1024:
                        b64_data = base64.b64encode(att_file.read()).decode("utf-8")
                        attachments.append({
                            "name": att_file.name,
                            "size": att_file.size,
                            "type": att_file.content_type or "application/octet-stream",
                            "data": b64_data,
                            "uploaded_at": now_str,
                        })
                    else:
                        messages.warning(request, "File attachment skipped: exceeds 500KB limit.")

                new_item = {
                    "id": str(uuid.uuid4()),
                    "title": form.cleaned_data["title"].strip(),
                    "username": form.cleaned_data.get("username", "").strip(),
                    "password": form.cleaned_data.get("password", ""),
                    "totp_secret": form.cleaned_data.get("totp_secret", "").strip(),
                    "url": form.cleaned_data.get("url", "").strip(),
                    "category": form.cleaned_data.get("category", "Logins"),
                    "group": form.cleaned_data.get("group", "").strip(),
                    "notes": form.cleaned_data.get("notes", "").strip(),
                    "password_history": [],
                    "attachments": attachments,
                    "created_at": now_str,
                    "updated_at": now_str,
                }
                items.append(new_item)
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Vault: Add credential for {new_item['title']}"
                )
                messages.success(request, f"Saved '{new_item['title']}' to your encrypted GitHub vault.")
            except Exception as e:
                messages.error(request, f"Failed to save credential: {e}")
    return redirect("gitpass:vault")


@require_session
def edit_item_view(request, item_id: str):
    """Edit an existing credential, save password history, and commit to GitHub."""
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
        # Handle attachment deletion action
        del_att_idx = request.POST.get("delete_attachment_idx")
        if del_att_idx is not None:
            try:
                idx = int(del_att_idx)
                attachments = target_item.get("attachments", [])
                if 0 <= idx < len(attachments):
                    removed = attachments.pop(idx)
                    target_item["attachments"] = attachments
                    _save_active_vault(
                        request,
                        items,
                        commit_msg=f"Git-Vault: Remove attachment '{removed.get('name')}' from {target_item['title']}"
                    )
                    messages.success(request, f"Attachment '{removed.get('name')}' deleted.")
            except Exception as e:
                messages.error(request, f"Failed to delete attachment: {e}")
            return redirect("gitpass:edit_item", item_id=item_id)

        form = CredentialForm(request.POST, request.FILES)
        if form.is_valid():
            try:
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                new_pwd = form.cleaned_data.get("password", "")
                old_pwd = target_item.get("password", "")

                # Record password history if password changed
                if new_pwd and old_pwd and new_pwd != old_pwd:
                    history = target_item.get("password_history", [])
                    history.insert(0, {
                        "password": old_pwd,
                        "changed_at": now_str
                    })
                    target_item["password_history"] = history[:10]

                target_item["title"] = form.cleaned_data["title"].strip()
                target_item["username"] = form.cleaned_data.get("username", "").strip()
                target_item["password"] = new_pwd
                target_item["totp_secret"] = form.cleaned_data.get("totp_secret", "").strip()
                target_item["url"] = form.cleaned_data.get("url", "").strip()
                target_item["category"] = form.cleaned_data.get("category", "Logins")
                target_item["group"] = form.cleaned_data.get("group", "").strip()
                target_item["notes"] = form.cleaned_data.get("notes", "").strip()
                target_item["updated_at"] = now_str

                # Process optional newly added attachment
                att_file = request.FILES.get("attachment")
                if att_file:
                    if att_file.size <= 500 * 1024:
                        b64_data = base64.b64encode(att_file.read()).decode("utf-8")
                        attachments = target_item.get("attachments", [])
                        attachments.append({
                            "name": att_file.name,
                            "size": att_file.size,
                            "type": att_file.content_type or "application/octet-stream",
                            "data": b64_data,
                            "uploaded_at": now_str,
                        })
                        target_item["attachments"] = attachments
                    else:
                        messages.warning(request, "File attachment skipped: exceeds 500KB limit.")

                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Vault: Update credential for {target_item['title']}"
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
    """Soft-delete a credential into Trash with 30-day recovery guarantee."""
    if request.method == "POST":
        try:
            items, _ = _get_active_vault(request)
            target = next((i for i in items if i.get("id") == item_id), None)
            if target:
                target["deleted_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Vault: Move '{target.get('title', 'item')}' to Trash"
                )
                messages.success(request, f"Moved '{target.get('title')}' to Trash. Recoverable anytime.")
            else:
                messages.warning(request, "Credential not found.")
        except Exception as e:
            messages.error(request, f"Failed to delete credential: {e}")
    return redirect("gitpass:vault")


@require_session
def restore_item_view(request, item_id: str):
    """Restore a credential from Trash back to active vault."""
    if request.method == "POST":
        try:
            items, _ = _get_active_vault(request)
            target = next((i for i in items if i.get("id") == item_id), None)
            if target and target.get("deleted_at"):
                target.pop("deleted_at", None)
                target["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Vault: Restore '{target.get('title')}' from Trash"
                )
                messages.success(request, f"Restored '{target.get('title')}' to your vault.")
            else:
                messages.warning(request, "Item not found in Trash.")
        except Exception as e:
            messages.error(request, f"Failed to restore credential: {e}")
    return redirect(f"{request.build_absolute_uri('/vault/')}?tab=trash")


@require_session
def permanent_delete_item_view(request, item_id: str):
    """Permanently destroy a credential from Trash."""
    if request.method == "POST":
        try:
            items, _ = _get_active_vault(request)
            target = next((i for i in items if i.get("id") == item_id), None)
            if target:
                items = [i for i in items if i.get("id") != item_id]
                _save_active_vault(
                    request,
                    items,
                    commit_msg=f"Git-Vault: Permanently destroy '{target.get('title')}'"
                )
                messages.success(request, f"Permanently deleted '{target.get('title')}'.")
            else:
                messages.warning(request, "Item not found.")
        except Exception as e:
            messages.error(request, f"Failed to permanently delete credential: {e}")
    return redirect(f"{request.build_absolute_uri('/vault/')}?tab=trash")


@require_session
def empty_trash_view(request):
    """Permanently purge all deleted items from Trash."""
    if request.method == "POST":
        try:
            items, _ = _get_active_vault(request)
            purged_count = sum(1 for i in items if i.get("deleted_at"))
            items = [i for i in items if not i.get("deleted_at")]
            _save_active_vault(
                request,
                items,
                commit_msg=f"Git-Vault: Empty Trash ({purged_count} items permanently deleted)"
            )
            messages.success(request, f"Emptied Trash. {purged_count} items permanently destroyed.")
        except Exception as e:
            messages.error(request, f"Failed to empty trash: {e}")
    return redirect("gitpass:vault")


@require_session
def download_attachment_view(request, item_id: str, att_idx: int):
    """Download a decrypted file attachment from a vault item."""
    try:
        items, _ = _get_active_vault(request)
        target = next((i for i in items if i.get("id") == item_id), None)
        if not target:
            messages.error(request, "Credential item not found.")
            return redirect("gitpass:vault")

        attachments = target.get("attachments", [])
        if not (0 <= att_idx < len(attachments)):
            messages.error(request, "Attachment not found.")
            return redirect("gitpass:vault")

        att = attachments[att_idx]
        file_bytes = base64.b64decode(att["data"])
        response = HttpResponse(file_bytes, content_type=att.get("type", "application/octet-stream"))
        response["Content-Disposition"] = f'attachment; filename="{att.get("name", "attachment")}"'
        return response
    except Exception as e:
        messages.error(request, f"Failed to download attachment: {e}")
        return redirect("gitpass:vault")


@require_session
def api_cloud_sync(request):
    """1-Click Cloud Synchronization with GitHub remote repository."""
    if request.session.get("is_demo"):
        return JsonResponse({
            "synced": True,
            "updated": False,
            "message": "Demo vault in-sync with memory.",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })

    try:
        token = request.session["github_token"]
        owner = request.session["github_username"]
        repo = request.session["github_repo"]
        filename = request.session["github_filename"]
        master_pwd = request.session["master_password"]
        local_sha = request.session.get("file_sha")

        raw_content, remote_sha = get_repo_file(token, owner, repo, filename)

        if remote_sha != local_sha and raw_content:
            # Remote repository has newer changes
            latest_items = decrypt_vault(raw_content, master_pwd)
            request.session["file_sha"] = remote_sha
            return JsonResponse({
                "synced": True,
                "updated": True,
                "items_count": len([i for i in latest_items if not i.get("deleted_at")]),
                "remote_sha": remote_sha[:7],
                "message": f"Successfully synced with GitHub cloud! Updated to commit {remote_sha[:7]}.",
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
        else:
            return JsonResponse({
                "synced": True,
                "updated": False,
                "remote_sha": (remote_sha or local_sha or "")[:7],
                "message": "Vault is 100% in sync with GitHub cloud storage.",
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
    except Exception as e:
        return JsonResponse({"synced": False, "error": str(e)}, status=500)


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
                    commit_msg="Git-Vault: Re-encrypt vault with new master password"
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


@require_session
def api_audit_vault(request):
    """
    Audits active vault for password strength, reuse, and breaches (k-Anonymity).
    """
    try:
        items, _ = _get_active_vault(request)
        check_breaches = request.GET.get("check_breaches", "true").lower() == "true"
        audit_result = audit_vault_credentials(items, check_breaches=check_breaches)
        return JsonResponse(audit_result)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_session
def api_totp_code(request):
    """
    Generates rolling 6-digit TOTP code and countdown for a given secret or item.
    """
    secret = request.GET.get("secret", "").strip()
    item_id = request.GET.get("item_id", "").strip()

    if not secret and item_id:
        try:
            items, _ = _get_active_vault(request)
            item = next((i for i in items if i.get("id") == item_id), None)
            if item:
                secret = item.get("totp_secret", "")
        except Exception:
            pass

    if not secret:
        return JsonResponse({"error": "No TOTP secret provided.", "code": "", "seconds_remaining": 0}, status=400)

    result = generate_totp_code(secret)
    return JsonResponse(result)


@require_session
def api_time_machine_commits(request):
    """
    Fetches the historical Git commit timeline for passwords.txt.
    """
    if request.session.get("is_demo"):
        commits = request.session.get("demo_commits", [])
        return JsonResponse({"commits": commits, "is_demo": True})

    try:
        token = request.session["github_token"]
        owner = request.session["github_username"]
        repo = request.session["github_repo"]
        filename = request.session["github_filename"]

        commits = list_file_commits(token, owner, repo, filename)
        return JsonResponse({"commits": commits, "is_demo": False})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_session
def api_time_machine_preview(request):
    """
    Decrypts and returns items from a historical Git commit snapshot without saving.
    """
    commit_sha = request.GET.get("commit_sha", "").strip()
    if not commit_sha:
        return JsonResponse({"error": "commit_sha is required"}, status=400)

    if request.session.get("is_demo"):
        items = request.session.get("demo_vault", [])
        return JsonResponse({
            "success": True,
            "commit_sha": commit_sha,
            "items_count": len(items),
            "items": [{"id": i.get("id"), "title": i.get("title"), "username": i.get("username"), "category": i.get("category")} for i in items],
            "is_demo": True
        })

    try:
        token = request.session["github_token"]
        owner = request.session["github_username"]
        repo = request.session["github_repo"]
        filename = request.session["github_filename"]
        master_pwd = request.session["master_password"]

        raw_ciphertext = get_file_at_commit(token, owner, repo, filename, commit_sha)
        if not raw_ciphertext:
            return JsonResponse({"error": "No file found at this commit."}, status=404)

        historical_items = decrypt_vault(raw_ciphertext, master_pwd)
        return JsonResponse({
            "success": True,
            "commit_sha": commit_sha,
            "items_count": len(historical_items),
            "items": [{"id": i.get("id"), "title": i.get("title"), "username": i.get("username"), "category": i.get("category")} for i in historical_items],
            "is_demo": False
        })
    except InvalidMasterPasswordError:
        return JsonResponse({
            "error": "Cannot preview this snapshot: it was encrypted with a different master password."
        }, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_session
def api_time_machine_rollback(request):
    """
    Restores the vault to a historical commit snapshot and commits to GitHub.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST method required"}, status=405)

    commit_sha = request.POST.get("commit_sha", "").strip()
    if not commit_sha:
        return JsonResponse({"error": "commit_sha is required"}, status=400)

    if request.session.get("is_demo"):
        return JsonResponse({
            "success": True,
            "message": f"Demo vault successfully reverted to snapshot {commit_sha[:7]}!"
        })

    try:
        token = request.session["github_token"]
        owner = request.session["github_username"]
        repo = request.session["github_repo"]
        filename = request.session["github_filename"]
        master_pwd = request.session["master_password"]

        raw_ciphertext = get_file_at_commit(token, owner, repo, filename, commit_sha)
        if not raw_ciphertext:
            return JsonResponse({"error": "No file found at this commit."}, status=404)

        # Verify decryption works with current master password
        restored_items = decrypt_vault(raw_ciphertext, master_pwd)

        # Commit this restored state back to GitHub
        new_sha = _save_active_vault(
            request,
            restored_items,
            commit_msg=f"Git-Vault: Rollback vault to commit {commit_sha[:7]}"
        )

        return JsonResponse({
            "success": True,
            "message": f"Vault successfully restored to commit {commit_sha[:7]}!",
            "new_sha": new_sha,
            "restored_items_count": len(restored_items),
        })
    except InvalidMasterPasswordError:
        return JsonResponse({
            "error": "Rollback failed: The chosen commit was encrypted with a different master password."
        }, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def logout_view(request):
    """Clears the session and disconnects from GitHub."""
    request.session.flush()
    messages.info(request, "Disconnected. Your master password and credentials have been cleared from memory.")
    return redirect("gitpass:login")


def health_view(request):
    """Health check endpoint for Render."""
    return JsonResponse({"status": "healthy", "service": "Git-Vault", "zero_server_storage": True})


@require_session
def import_vault_view(request):
    """Import credentials in bulk from Chrome, Bitwarden, Firefox, 1Password, or CSV/JSON."""
    if request.method == "POST":
        upload_file = request.FILES.get("import_file")
        if not upload_file:
            messages.error(request, "Please choose a CSV or JSON file to import.")
            return redirect("gitpass:vault")

        # Max file size limit: 10MB
        if upload_file.size > 10 * 1024 * 1024:
            messages.error(request, "File exceeds maximum size limit of 10MB.")
            return redirect("gitpass:vault")

        try:
            raw_bytes = upload_file.read()
            imported_items = parse_import_file(raw_bytes, upload_file.name)
            if not imported_items:
                messages.warning(request, "No credentials found in the uploaded file.")
                return redirect("gitpass:vault")

            dedup = request.POST.get("deduplicate", "true").lower() in ("true", "1", "yes", "on")
            current_items, _ = _get_active_vault(request)

            merged_items, added_cnt, updated_cnt = merge_vault_items(
                current_items, imported_items, deduplicate=dedup
            )

            _save_active_vault(
                request,
                merged_items,
                commit_msg=f"Git-Vault: Import {len(imported_items)} credentials from {upload_file.name}"
            )

            messages.success(
                request,
                f"Successfully imported {len(imported_items)} credentials! ({added_cnt} newly added, {updated_cnt} updated)"
            )
        except VaultImportError as e:
            messages.error(request, f"Import error: {e}")
        except Exception as e:
            messages.error(request, f"Failed to import credentials: {e}")

    return redirect("gitpass:vault")


def service_worker_view(request):
    """Serves the PWA Service Worker script from root scope /sw.js."""
    sw_path = os.path.join(settings.BASE_DIR, "static", "js", "sw.js")
    try:
        with open(sw_path, "r", encoding="utf-8") as f:
            content = f.read()
        response = HttpResponse(content, content_type="application/javascript")
        response["Service-Worker-Allowed"] = "/"
        response["Cache-Control"] = "no-cache"
        return response
    except Exception:
        return HttpResponse("// SW unavailable", content_type="application/javascript")


def manifest_view(request):
    """Serves the PWA Web App Manifest from /manifest.webmanifest."""
    manifest_path = os.path.join(settings.BASE_DIR, "static", "manifest.webmanifest")
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            content = f.read()
        response = HttpResponse(content, content_type="application/manifest+json")
        response["Cache-Control"] = "public, max-age=3600"
        return response
    except Exception:
        return HttpResponse("{}", content_type="application/manifest+json")


