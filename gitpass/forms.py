from django import forms


class ConnectForm(forms.Form):
    username = forms.CharField(
        max_length=150,
        label="GitHub Username",
        widget=forms.TextInput(attrs={
            "placeholder": "e.g. octocat",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        })
    )
    repo_name = forms.CharField(
        max_length=150,
        label="Repository Name",
        widget=forms.TextInput(attrs={
            "placeholder": "e.g. my-passwords-vault",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        })
    )
    filename = forms.CharField(
        max_length=150,
        label="Filename in Repository",
        initial="passwords.txt",
        widget=forms.TextInput(attrs={
            "placeholder": "e.g. passwords.txt or vault.dat",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        }),
        help_text="File inside your GitHub repository that holds the encrypted ciphertext."
    )
    token = forms.CharField(
        label="Personal Access Token (PAT)",
        widget=forms.PasswordInput(attrs={
            "placeholder": "ghp_xxxxxxxxxxxxxxxxxxxx",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        }),
        help_text="Classic PAT with 'repo' scope, or Fine-grained PAT with Contents (R/W) permission."
    )
    master_password = forms.CharField(
        label="Master Password",
        widget=forms.PasswordInput(attrs={
            "placeholder": "Your master encryption key",
            "class": "form-control",
            "autocomplete": "new-password",
            "required": True,
        }),
        help_text="Never stored on our server! Encrypts and decrypts all your vault items."
    )


class CredentialForm(forms.Form):
    CATEGORY_CHOICES = [
        ("Logins", "Logins & Web"),
        ("Apps", "Desktop & Mobile Apps"),
        ("Social", "Social Media"),
        ("Work", "Work & Dev"),
        ("Finance", "Finance & Banking"),
        ("Personal", "Personal & Private"),
        ("Other", "Other"),
    ]

    title = forms.CharField(
        max_length=120,
        label="Title / Service Name",
        widget=forms.TextInput(attrs={
            "placeholder": "e.g. Google, GitHub, Netflix",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        })
    )
    username = forms.CharField(
        max_length=150,
        label="Username / Email",
        widget=forms.TextInput(attrs={
            "placeholder": "user@example.com or username",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        })
    )
    password = forms.CharField(
        label="Password",
        widget=forms.TextInput(attrs={
            "placeholder": "Password",
            "class": "form-control font-mono",
            "id": "item-password-field",
            "autocomplete": "new-password",
            "required": True,
        })
    )
    url = forms.URLField(
        required=False,
        label="Website URL",
        widget=forms.URLInput(attrs={
            "placeholder": "https://example.com/login",
            "class": "form-control",
            "autocomplete": "off",
        })
    )
    totp_secret = forms.CharField(
        required=False,
        label="2FA / TOTP Secret Key (Optional)",
        widget=forms.TextInput(attrs={
            "placeholder": "e.g. JBSWY3DPEHPK3PXP or otpauth://totp/...",
            "class": "form-control font-mono",
            "autocomplete": "off",
        }),
        help_text="Paste Base32 secret or otpauth:// URI to generate live 6-digit rolling 2FA codes."
    )
    category = forms.ChoiceField(
        choices=CATEGORY_CHOICES,
        initial="Logins",
        label="Category",
        widget=forms.Select(attrs={"class": "form-control"})
    )
    notes = forms.CharField(
        required=False,
        label="Notes",
        widget=forms.Textarea(attrs={
            "placeholder": "Recovery codes, security answers, or extra notes...",
            "class": "form-control",
            "autocomplete": "off",
            "rows": 3,
        })
    )


class ChangeMasterPasswordForm(forms.Form):
    current_password = forms.CharField(
        label="Current Master Password",
        widget=forms.PasswordInput(attrs={
            "placeholder": "Enter your current master password",
            "class": "form-control",
            "autocomplete": "new-password",
            "required": True,
        })
    )
    new_password = forms.CharField(
        min_length=8,
        label="New Master Password",
        widget=forms.PasswordInput(attrs={
            "placeholder": "At least 8 characters",
            "class": "form-control",
            "autocomplete": "new-password",
            "required": True,
        })
    )
    confirm_password = forms.CharField(
        min_length=8,
        label="Confirm New Master Password",
        widget=forms.PasswordInput(attrs={
            "placeholder": "Re-enter new master password",
            "class": "form-control",
            "autocomplete": "new-password",
            "required": True,
        })
    )

    def clean(self):
        cleaned_data = super().clean()
        new_pwd = cleaned_data.get("new_password")
        confirm_pwd = cleaned_data.get("confirm_password")
        if new_pwd and confirm_pwd and new_pwd != confirm_pwd:
            raise forms.ValidationError("New master passwords do not match.")
        return cleaned_data


class DeleteRepoForm(forms.Form):
    confirm_repo_name = forms.CharField(
        label="Type repository name to confirm",
        widget=forms.TextInput(attrs={
            "placeholder": "Type exact repository name",
            "class": "form-control",
            "autocomplete": "off",
            "required": True,
        })
    )
