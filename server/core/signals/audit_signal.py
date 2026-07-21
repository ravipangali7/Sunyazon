"""Thin audit helpers used by services — no model save hooks that cascade."""

# Domain cascades live in services. This module is reserved for optional
# post_save hooks that only write AuditLog when explicitly connected.
# Currently services call write_audit() directly to avoid recursion.
