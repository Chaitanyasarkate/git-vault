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
        self.assertIn("git-pass-aes256gcm", encrypted_envelope)

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
        self.assertContains(resp, "Git-Pass")
        self.assertContains(resp, "Zero Server Storage")

    def test_instructions_page_renders(self):
        resp = self.client.get(reverse("gitpass:instructions"))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Git-Pass Setup Instructions")

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
