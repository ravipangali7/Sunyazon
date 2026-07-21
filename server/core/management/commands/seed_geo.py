"""Seed Nepal geo masters — Country → Province → District → Municipality.

Usage:
    python manage.py seed_geo
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Country, District, Municipality, Province

# Minimal but useful Nepal seed (expandable). Structure mirrors models.md geo masters.
NEPAL = {
    "code": "NP",
    "name": "Nepal",
    "phone_code": "+977",
    "provinces": [
        {
            "name": "Koshi",
            "districts": [
                {"name": "Jhapa", "municipalities": [
                    ("Birtamod", "municipality"), ("Mechinagar", "municipality"),
                ]},
                {"name": "Morang", "municipalities": [
                    ("Biratnagar", "metro"), ("Belbari", "municipality"),
                ]},
                {"name": "Sunsari", "municipalities": [
                    ("Itahari", "sub_metro"), ("Dharan", "sub_metro"),
                ]},
            ],
        },
        {
            "name": "Madhesh",
            "districts": [
                {"name": "Parsa", "municipalities": [("Birgunj", "metro")]},
                {"name": "Dhanusha", "municipalities": [("Janakpur", "sub_metro")]},
            ],
        },
        {
            "name": "Bagmati",
            "districts": [
                {"name": "Kathmandu", "municipalities": [
                    ("Kathmandu", "metro"), ("Kirtipur", "municipality"),
                    ("Budhanilkantha", "municipality"),
                ]},
                {"name": "Lalitpur", "municipalities": [
                    ("Lalitpur", "metro"), ("Godawari", "municipality"),
                ]},
                {"name": "Bhaktapur", "municipalities": [
                    ("Bhaktapur", "municipality"), ("Madhyapur Thimi", "municipality"),
                ]},
                {"name": "Kavrepalanchok", "municipalities": [
                    ("Banepa", "municipality"), ("Dhulikhel", "municipality"),
                ]},
                {"name": "Chitwan", "municipalities": [
                    ("Bharatpur", "metro"), ("Ratnanagar", "municipality"),
                ]},
            ],
        },
        {
            "name": "Gandaki",
            "districts": [
                {"name": "Kaski", "municipalities": [("Pokhara", "metro")]},
                {"name": "Syangja", "municipalities": [("Putalibazar", "municipality")]},
            ],
        },
        {
            "name": "Lumbini",
            "districts": [
                {"name": "Rupandehi", "municipalities": [
                    ("Butwal", "sub_metro"), ("Siddharthanagar", "municipality"),
                ]},
                {"name": "Banke", "municipalities": [("Nepalgunj", "sub_metro")]},
            ],
        },
        {
            "name": "Karnali",
            "districts": [
                {"name": "Surkhet", "municipalities": [("Birendranagar", "municipality")]},
            ],
        },
        {
            "name": "Sudurpashchim",
            "districts": [
                {"name": "Kailali", "municipalities": [("Dhangadhi", "sub_metro")]},
            ],
        },
    ],
}


class Command(BaseCommand):
    help = "Seed Nepal geo masters (country / province / district / municipality)."

    @transaction.atomic
    def handle(self, *args, **options):
        country, created = Country.objects.update_or_create(
            code=NEPAL["code"],
            defaults={"name": NEPAL["name"], "phone_code": NEPAL["phone_code"]},
        )
        p_count = d_count = m_count = 0
        for p_data in NEPAL["provinces"]:
            province, _ = Province.objects.update_or_create(
                country=country, name=p_data["name"],
            )
            p_count += 1
            for d_data in p_data["districts"]:
                district, _ = District.objects.update_or_create(
                    province=province, name=d_data["name"],
                )
                d_count += 1
                for m_name, m_type in d_data["municipalities"]:
                    Municipality.objects.update_or_create(
                        district=district, name=m_name,
                        defaults={"type": m_type},
                    )
                    m_count += 1

        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {country.name}: {p_count} provinces, {d_count} districts, {m_count} municipalities."
        ))
