"""Seed global HR onboarding templates + Gurukul training modules."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from core.models import OnboardingTaskTemplate, TrainingModule

DEFAULT_ONBOARDING = [
    (1, "Digital onboarding, profile, biometric attendance", "HR Manager", "App access active", 10),
    (2, "Institutional introduction, reporting line", "GM", "Org understanding", 20),
    (3, "SOP study, Code of Conduct signature", "Branch Officer", "Procedure clarity", 30),
    (4, "App dashboard, order management, reporting training", "IT Deputy Head", "Tech proficiency", 40),
    (5, "Gurukul mandatory courses + exam", "Gurukul Coordinator", "Certification", 50),
    (6, "Factory/warehouse site visit", "Production Manager", "Process understanding", 60),
    (7, "Week review, next week KPI setting", "GM", "Clear action plan", 70),
]

DEFAULT_MODULES = [
    ("GUR-INTRO", "Company introduction", "", "Common orientation module", 80, True, 10),
    ("GUR-COC", "Code of Conduct", "", "Ethics and conduct", 80, True, 20),
    ("GUR-SALES", "Sales: 4-tier distribution & sample collection", "Sales", "Department-specific", 80, False, 30),
    ("GUR-FIN", "Finance: IRD billing, TDS, budget approval", "Finance", "Department-specific", 80, False, 40),
    ("GUR-QC", "Production/Lab: QC standards, batch tracking, GRN", "Production", "Department-specific", 80, False, 50),
]


class Command(BaseCommand):
    help = "Seed global HR onboarding task templates and training modules"

    def handle(self, *args, **options):
        created_t = 0
        for day, name, role, outcome, sort in DEFAULT_ONBOARDING:
            _, was = OnboardingTaskTemplate.objects.update_or_create(
                organization=None,
                task_name=name,
                defaults={
                    "day_number": day,
                    "supervisor_role": role,
                    "outcome": outcome,
                    "sort_order": sort,
                    "is_active": True,
                },
            )
            if was:
                created_t += 1

        created_m = 0
        for code, name, dept, desc, pass_score, mandatory, sort in DEFAULT_MODULES:
            _, was = TrainingModule.objects.update_or_create(
                organization=None,
                code=code,
                defaults={
                    "name": name,
                    "department": dept,
                    "description": desc,
                    "pass_score": pass_score,
                    "is_mandatory": mandatory,
                    "sort_order": sort,
                    "is_active": True,
                },
            )
            if was:
                created_m += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"HR catalog ready — templates created={created_t}, modules created={created_m}"
            )
        )
