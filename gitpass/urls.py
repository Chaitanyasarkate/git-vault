from django.urls import path
from . import views

app_name = "gitpass"

urlpatterns = [
    path("", views.login_view, name="login"),
    path("instructions/", views.instructions_view, name="instructions"),
    path("vault/", views.vault_view, name="vault"),
    path("vault/add/", views.add_item_view, name="add_item"),
    path("vault/edit/<str:item_id>/", views.edit_item_view, name="edit_item"),
    path("vault/delete/<str:item_id>/", views.delete_item_view, name="delete_item"),
    path("vault/restore/<str:item_id>/", views.restore_item_view, name="restore_item"),
    path("vault/permanent-delete/<str:item_id>/", views.permanent_delete_item_view, name="permanent_delete_item"),
    path("vault/empty-trash/", views.empty_trash_view, name="empty_trash"),
    path("vault/attachment/<str:item_id>/<int:att_idx>/", views.download_attachment_view, name="download_attachment"),
    path("vault/change-master-password/", views.change_master_password_view, name="change_master_password"),
    path("vault/delete-repo/", views.delete_repo_view, name="delete_repo"),
    path("vault/export/", views.export_vault_view, name="export_vault"),
    path("vault/import/", views.import_vault_view, name="import_vault"),
    path("vault/raw/", views.raw_vault_view, name="raw_vault"),
    path("api/cloud-sync/", views.api_cloud_sync, name="api_cloud_sync"),
    path("api/generate-password/", views.api_generate_password, name="api_generate_password"),
    path("api/audit-vault/", views.api_audit_vault, name="api_audit_vault"),
    path("api/totp-code/", views.api_totp_code, name="api_totp_code"),
    path("api/time-machine/commits/", views.api_time_machine_commits, name="api_time_machine_commits"),
    path("api/time-machine/preview/", views.api_time_machine_preview, name="api_time_machine_preview"),
    path("api/time-machine/rollback/", views.api_time_machine_rollback, name="api_time_machine_rollback"),
    path("logout/", views.logout_view, name="logout"),
    path("health/", views.health_view, name="health"),
    path("sw.js", views.service_worker_view, name="service_worker"),
    path("manifest.webmanifest", views.manifest_view, name="manifest"),
]

