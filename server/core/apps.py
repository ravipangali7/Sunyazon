from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Sunyazon / BEOS Core"

    def ready(self):
        # Thin cross-cutting signals only (audit helpers, task notify, embedding)
        from core import signals  # noqa: F401
