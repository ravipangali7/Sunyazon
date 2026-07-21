"""Notification signals — task assignee notify only (thin)."""

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="core.Task")
def notify_on_task_assign(sender, instance, created, **kwargs):
    """On Task created/updated with assignee → Notification type=task."""
    if not instance.assignee_id:
        return
    user = getattr(instance.assignee, "user", None)
    if user is None:
        return
    # Avoid duplicate spam on every save: notify on create or status→assigned
    if not created and instance.status != "assigned":
        return
    from core.services.common import notify

    notify(
        user,
        title=f"Task: {instance.title}",
        body=f"Status: {instance.status}",
        type="task",
    )
