"""Domain services — business cascades from models_logic.md.

Prefer calling these from APIs/views; keep models thin.
Thin signals handle audit/notification/embedding only.
"""

from core.services.common import DomainError, notify, write_audit
from core.services import (
    checkout_service,
    company_registration_service,
    crm_service,
    dispatch_service,
    finance_service,
    grn_service,
    hr_recruitment_service,
    kyc_service,
    leave_service,
    maintenance_service,
    org_setup_service,
    payment_service,
    payroll_service,
    process_service,
    procurement_service,
    qa_service,
    social_service,
    stock_service,
    workflow_service,
    work_order_service,
)

__all__ = [
    "DomainError",
    "notify",
    "write_audit",
    "checkout_service",
    "company_registration_service",
    "crm_service",
    "dispatch_service",
    "finance_service",
    "grn_service",
    "hr_recruitment_service",
    "kyc_service",
    "leave_service",
    "maintenance_service",
    "org_setup_service",
    "payment_service",
    "payroll_service",
    "process_service",
    "procurement_service",
    "qa_service",
    "social_service",
    "stock_service",
    "workflow_service",
    "work_order_service",
]
