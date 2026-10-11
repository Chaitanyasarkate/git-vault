import json
from unittest.mock import patch, MagicMock
from django.test import TestCase, Client
from django.urls import reverse

from gitpass.crypto import (
    encrypt_vault,
    decrypt_vault,
    InvalidMasterPasswordError,
    CorruptedVaultError,
    generate_secure_password,
)
from gitpass.github_api import (
    get_repo_file,
    update_or_create_repo_file,
    delete_repository,
    verify_repo_access,
    GitHubAuthError,
)


class CryptoTests(TestCase):
    def setUp(self):
        self.master_pwd = "SuperSecretMasterPassphrase123!"
        self.sample_items = [
            {
                "id": "1",
                "title": "GitHub",
                "username": "alice",
                "password": "my_secret_token",
                "url": "https://github.com",
                "category": "Work",
                "notes": "Dev account",
            },
            {
                "id": "2",
                "title": "Netflix",
                "username": "alice@gmail.com",
                "password": "streaming_pass",
                "url": "https://netflix.com",
                "category": "Personal",
                "notes": "",
            }
        ]

    def test_encrypt_decrypt_round_trip(self):
        encrypted_envelope = encrypt_vault(self.sample_items, self.master_pwd)
        self.assertIsInstance(encrypted_envelope, str)
        self.assertIn("git-vault-aes256gcm", encrypted_envelope)

        decrypted = decrypt_vault(encrypted_envelope, self.master_pwd)
        self.assertEqual(len(decrypted), 2)
        self.assertEqual(decrypted[0]["title"], "GitHub")
        self.assertEqual(decrypted[1]["password"], "streaming_pass")

    def test_decrypt_invalid_password(self):
        encrypted = encrypt_vault(self.sample_items, self.master_pwd)
        with self.assertRaises(InvalidMasterPasswordError):
            decrypt_vault(encrypted, "WrongPassword!")

    def test_decrypt_corrupted_vault(self):
        with self.assertRaises(CorruptedVaultError):
            decrypt_vault("Not a valid json string", self.master_pwd)

    def test_decrypt_empty_file(self):
        self.assertEqual(decrypt_vault("", self.master_pwd), [])
        self.assertEqual(decrypt_vault("   ", self.master_pwd), [])

    def test_password_generator(self):
        pwd = generate_secure_password(length=24, use_symbols=True, use_digits=True)
        self.assertEqual(len(pwd), 24)
        self.assertTrue(any(c.isdigit() for c in pwd))


class GitHubApiTests(TestCase):
    @patch("gitpass.github_api.requests.get")
    def test_verify_repo_access_success(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"id": 1234, "name": "my-vault"}
        mock_get.return_value = mock_resp

        res = verify_repo_access("ghp_fake", "alice", "my-vault")
        self.assertEqual(res["name"], "my-vault")

    @patch("gitpass.github_api.requests.get")
    def test_verify_repo_access_unauthorized(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        with self.assertRaises(GitHubAuthError):
            verify_repo_access("ghp_bad_token", "alice", "my-vault")

    @patch("gitpass.github_api.requests.get")
    def test_get_repo_file_not_found(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_get.return_value = mock_resp

        content, sha = get_repo_file("ghp_fake", "alice", "my-vault", "passwords.txt")
        self.assertEqual(content, "")
        self.assertIsNone(sha)

    @patch("gitpass.github_api.requests.delete")
    def test_delete_repository_success(self, mock_delete):
        mock_resp = MagicMock()
        mock_resp.status_code = 204
        mock_delete.return_value = mock_resp

        res = delete_repository("ghp_fake", "alice", "my-vault")
        self.assertTrue(res)


class ViewsTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_login_page_renders(self):
        resp = self.client.get(reverse("gitpass:login"))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Git-Vault")
        self.assertContains(resp, "Zero Server Storage")

    def test_instructions_page_renders(self):
        resp = self.client.get(reverse("gitpass:instructions"))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Git-Vault Setup Instructions")

    def test_health_check(self):
        resp = self.client.get(reverse("gitpass:health"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["zero_server_storage"])

    def test_demo_mode_login_and_vault(self):
        # Enter demo mode
        resp = self.client.post(reverse("gitpass:login"), {"action": "demo"}, follow=True)
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Password Vault")
        self.assertContains(resp, "GitHub")
        self.assertContains(resp, "ProtonMail")

        # Add item in demo mode
        add_resp = self.client.post(
            reverse("gitpass:add_item"),
            {
                "title": "Twitter / X",
                "username": "@alice",
                "password": "strongPassword123!",
                "category": "Social",
                "url": "https://x.com",
                "notes": "Testing",
            },
            follow=True
        )
        self.assertEqual(add_resp.status_code, 200)
        self.assertContains(add_resp, "Twitter / X")

        # Logout clears session
        logout_resp = self.client.get(reverse("gitpass:logout"), follow=True)
        self.assertEqual(logout_resp.status_code, 200)
        self.assertContains(logout_resp, "Connect to Your Repository")


class AdvancedFeatureTests(TestCase):
    def setUp(self):
        self.client = Client()
        # Log into demo mode
        self.client.post(reverse("gitpass:login"), {"action": "demo"}, follow=True)

    def test_totp_generation(self):
        from gitpass.totp import generate_totp_code, clean_base32_secret
        secret = "JBSWY3DPEHPK3PXP"
        cleaned = clean_base32_secret(secret)
        self.assertEqual(cleaned, "JBSWY3DPEHPK3PXP")

        totp = generate_totp_code(secret)
        self.assertTrue(totp["valid"])
        self.assertEqual(len(totp["code"]), 6)
        self.assertTrue(totp["code"].isdigit())
        self.assertGreaterEqual(totp["seconds_remaining"], 1)
        self.assertLessEqual(totp["seconds_remaining"], 30)

        # Test otpauth:// URI parsing
        uri = "otpauth://totp/GitHub:developer?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
        totp_uri = generate_totp_code(uri)
        self.assertTrue(totp_uri["valid"])
        self.assertEqual(totp_uri["code"], totp["code"])

    def test_security_audit_strength(self):
        from gitpass.security_audit import calculate_password_strength, audit_vault_credentials
        weak = calculate_password_strength("12345")
        self.assertEqual(weak["label"], "Weak")
        self.assertLess(weak["score"], 50)

        strong = calculate_password_strength("xK9!mQ7#vL2$pZ8*kP9@")
        self.assertIn(strong["label"], ["Strong", "Very Strong"])
        self.assertGreaterEqual(strong["score"], 70)

        # Test vault audit
        items = [
            {"id": "1", "title": "A", "username": "u1", "password": "weak"},
            {"id": "2", "title": "B", "username": "u2", "password": "weak"},
            {"id": "3", "title": "C", "username": "u3", "password": "superSecureLongPassword#123!"},
        ]
        audit = audit_vault_credentials(items, check_breaches=False)
        self.assertEqual(audit["total_count"], 3)
        self.assertEqual(audit["weak_count"], 2)
        self.assertEqual(audit["reused_count"], 2)

    def test_api_audit_vault_endpoint(self):
        resp = self.client.get(reverse("gitpass:api_audit_vault") + "?check_breaches=false")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("health_score", data)
        self.assertIn("grade", data)
        self.assertIn("items_audit", data)

    def test_api_totp_code_endpoint(self):
        resp = self.client.get(reverse("gitpass:api_totp_code") + "?secret=JBSWY3DPEHPK3PXP")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["valid"])
        self.assertEqual(len(data["code"]), 6)

    def test_api_time_machine_endpoints(self):
        # 1. Commits list
        commits_resp = self.client.get(reverse("gitpass:api_time_machine_commits"))
        self.assertEqual(commits_resp.status_code, 200)
        commits_data = commits_resp.json()
        self.assertIn("commits", commits_data)
        self.assertTrue(commits_data["is_demo"])

        # 2. Snapshot preview
        preview_resp = self.client.get(reverse("gitpass:api_time_machine_preview") + "?commit_sha=a1b2c3d4e5f6")
        self.assertEqual(preview_resp.status_code, 200)
        preview_data = preview_resp.json()
        self.assertTrue(preview_data["success"])
        self.assertIn("items", preview_data)

        # 3. Rollback
        rollback_resp = self.client.post(
            reverse("gitpass:api_time_machine_rollback"),
            {"commit_sha": "a1b2c3d4e5f6"}
        )
        self.assertEqual(rollback_resp.status_code, 200)
        rollback_data = rollback_resp.json()
        self.assertTrue(rollback_data["success"])

    def test_importer_chrome_csv(self):
        from gitpass.importer import parse_import_file
        chrome_csv = (
            "name,url,username,password,note\n"
            "Google,https://google.com,user@gmail.com,Pass123!,Recovery email set\n"
            "GitHub,https://github.com,octocat,GhpPass456,Work PAT\n"
        ).encode("utf-8")
        items = parse_import_file(chrome_csv, "chrome_passwords.csv")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "Google")
        self.assertEqual(items[0]["username"], "user@gmail.com")
        self.assertEqual(items[0]["password"], "Pass123!")
        self.assertEqual(items[1]["title"], "GitHub")

    def test_importer_bitwarden_csv(self):
        from gitpass.importer import parse_import_file
        bw_csv = (
            "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n"
            ",0,1,Discord,Gamer tag,,0,,discord_user,DiscordPass789,JBSWY3DPEHPK3PXP\n"
        ).encode("utf-8")
        items = parse_import_file(bw_csv, "bitwarden_export.csv")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Discord")
        self.assertEqual(items[0]["username"], "discord_user")
        self.assertEqual(items[0]["password"], "DiscordPass789")
        self.assertEqual(items[0]["totp_secret"], "JBSWY3DPEHPK3PXP")

    def test_importer_bitwarden_json(self):
        from gitpass.importer import parse_import_file
        bw_json = json.dumps({
            "encrypted": False,
            "items": [
                {
                    "name": "Spotify",
                    "notes": "Premium Plan",
                    "login": {
                        "uris": [{"uri": "https://spotify.com"}],
                        "username": "music_fan",
                        "password": "SpotifySecurePass!"
                    }
                }
            ]
        }).encode("utf-8")
        items = parse_import_file(bw_json, "bitwarden.json")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Spotify")
        self.assertEqual(items[0]["username"], "music_fan")
        self.assertEqual(items[0]["password"], "SpotifySecurePass!")

    def test_importer_merge_deduplicate(self):
        from gitpass.importer import merge_vault_items
        existing = [
            {"id": "1", "title": "GitHub", "username": "octocat", "password": "OldPassword"}
        ]
        imported = [
            {"id": "2", "title": "GitHub", "username": "octocat", "password": "NewUpdatedPassword"},
            {"id": "3", "title": "Netflix", "username": "octocat", "password": "NetflixPass"}
        ]
        merged, added, updated = merge_vault_items(existing, imported, deduplicate=True)
        self.assertEqual(len(merged), 2)
        self.assertEqual(added, 1)
        self.assertEqual(updated, 1)
        self.assertEqual(merged[0]["password"], "NewUpdatedPassword")

    def test_pwa_service_worker_and_manifest_endpoints(self):
        # Service worker
        sw_resp = self.client.get(reverse("gitpass:service_worker"))
        self.assertEqual(sw_resp.status_code, 200)
        self.assertIn("application/javascript", sw_resp["Content-Type"])

        # Web App Manifest
        manifest_resp = self.client.get(reverse("gitpass:manifest"))
        self.assertEqual(manifest_resp.status_code, 200)
        self.assertIn("application/manifest+json", manifest_resp["Content-Type"])

    def test_trash_recovery_and_permanent_delete(self):
        items = self.client.session["demo_vault"]
        target_id = items[0]["id"]
        target_title = items[0]["title"]

        # In demo mode, delete item
        del_resp = self.client.post(reverse("gitpass:delete_item", args=[target_id]), follow=True)
        self.assertEqual(del_resp.status_code, 200)

        # Check that it appears in Trash tab
        trash_resp = self.client.get(reverse("gitpass:vault") + "?tab=trash")
        self.assertEqual(trash_resp.status_code, 200)
        self.assertContains(trash_resp, target_title)
        self.assertContains(trash_resp, "Restore")
        self.assertContains(trash_resp, "Purge")

        # Restore item
        restore_resp = self.client.post(reverse("gitpass:restore_item", args=[target_id]), follow=True)
        self.assertEqual(restore_resp.status_code, 200)
        vault_resp = self.client.get(reverse("gitpass:vault"))
        self.assertContains(vault_resp, target_title)

        # Now delete again and permanently purge
        self.client.post(reverse("gitpass:delete_item", args=[target_id]), follow=True)
        purge_resp = self.client.post(reverse("gitpass:permanent_delete_item", args=[target_id]), follow=True)
        self.assertEqual(purge_resp.status_code, 200)

        # Confirm it's gone completely from trash
        trash_resp2 = self.client.get(reverse("gitpass:vault") + "?tab=trash")
        self.assertNotContains(trash_resp2, target_id)

    def test_password_history_on_edit(self):
        items = self.client.session["demo_vault"]
        target = items[1]
        target_id = target["id"]

        # Edit password
        edit_resp = self.client.post(
            reverse("gitpass:edit_item", args=[target_id]),
            {
                "title": target["title"],
                "username": target.get("username", "user"),
                "password": "BrandNewSecretPassword999!",
                "category": target.get("category", "Personal"),
                "url": target.get("url", ""),
                "notes": target.get("notes", ""),
            },
            follow=True
        )
        self.assertEqual(edit_resp.status_code, 200)
        # Verify old password was retained in password history
        vault_resp = self.client.get(reverse("gitpass:vault"))
        self.assertContains(vault_resp, "Previous Passwords")


    def test_cloud_sync_api(self):
        sync_resp = self.client.get(reverse("gitpass:api_cloud_sync"))
        self.assertEqual(sync_resp.status_code, 200)
        sync_data = sync_resp.json()
        self.assertTrue(sync_data["synced"])
        self.assertTrue(sync_data["success"])
        self.assertIn("message", sync_data)

    def test_generate_password_api(self):
        resp = self.client.get(reverse("gitpass:api_generate_password") + "?length=24&symbols=true&digits=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["password"]), 24)

    def test_totp_code_api(self):
        resp = self.client.get(reverse("gitpass:api_totp_code") + "?secret=JBSWY3DPEHPK3PXP")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["code"]), 6)
        self.assertIn("remaining", data)

    def test_audit_vault_api(self):
        resp = self.client.get(reverse("gitpass:api_audit_vault") + "?check_breaches=false")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIn("health_score", data)
        self.assertIn("items_audit", data)

    def test_export_endpoints(self):
        # JSON export
        resp_json = self.client.get(reverse("gitpass:export_vault") + "?format=json")
        self.assertEqual(resp_json.status_code, 200)
        self.assertEqual(resp_json["Content-Type"], "application/json")

        # CSV export
        resp_csv = self.client.get(reverse("gitpass:export_vault") + "?format=csv")
        self.assertEqual(resp_csv.status_code, 200)
        self.assertEqual(resp_csv["Content-Type"], "text/csv")

    def test_pwa_and_public_routes(self):
        resp_sw = self.client.get(reverse("gitpass:service_worker"))
        self.assertEqual(resp_sw.status_code, 200)
        self.assertIn("javascript", resp_sw["Content-Type"])

        resp_manifest = self.client.get(reverse("gitpass:manifest"))
        self.assertEqual(resp_manifest.status_code, 200)
        self.assertIn("manifest+json", resp_manifest["Content-Type"])

        resp_health = self.client.get(reverse("gitpass:health"))
        self.assertEqual(resp_health.status_code, 200)



