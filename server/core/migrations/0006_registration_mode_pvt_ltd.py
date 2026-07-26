# Generated manually for PVT LTD / Non-PVT LTD registration modes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_hr_salary_templates_modules"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="managing_director_name",
            field=models.CharField(
                blank=True,
                help_text="Managing Director name (used for Non-PVT LTD registration).",
                max_length=255,
            ),
        ),
        migrations.AlterField(
            model_name="organization",
            name="registration_mode",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pvt_ltd", "PVT LTD"),
                    ("non_pvt_ltd", "NON PVT LTD"),
                    ("already_registered", "Already Registered Company"),
                    ("new_company", "New Company"),
                ],
                db_index=True,
                max_length=32,
            ),
        ),
    ]
