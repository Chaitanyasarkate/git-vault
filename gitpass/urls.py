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
    path("vault/change-master-password/", views.change_master_password_view, name="change_master_password"),
    path("vault/delete-repo/", views.delete_repo_view, name="delete_repo"),
    path("vault/export/", views.export_vault_view, name="export_vault"),
    path("vault/raw/", views.raw_vault_view, name="raw_vault"),
    path("api/generate-password/", views.api_generate_password, name="api_generate_password"),
    path("logout/", views.logout_view, name="logout"),
    path("health/", views.health_view, name="health"),
]
