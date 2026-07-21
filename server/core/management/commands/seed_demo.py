"""Seed a demo manufacturer org with sample catalog, COA, warehouse, process definition.

Prerequisites: seed_geo + seed_core (and ideally create_superuser).

Usage:
    python manage.py seed_demo
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import (
    CAPA,
    Category,
    ChartOfAccount,
    Country,
    Department,
    Employee,
    FinalQARelease,
    GRN,
    GRNLine,
    IncomingInspection,
    IndustryTemplate,
    InProcessQC,
    ItemMaster,
    LabReport,
    NCR,
    Organization,
    OrgUser,
    PositionMaster,
    ProcessDefinition,
    ProcessStage,
    ProcessStageField,
    Product,
    ProductAttribute,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    QualityMaster,
    RFQ,
    Role,
    Tenant,
    User,
    UserProfile,
    Vendor,
    Warehouse,
)


class Command(BaseCommand):
    help = "Seed demo manufacturer org, catalog, warehouse, COA, and process definition."

    @transaction.atomic
    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug="sunyazon").first()
        if not tenant:
            self.stderr.write(self.style.ERROR("Run seed_core first (tenant missing)."))
            return

        country = Country.objects.filter(code="NP").first()
        if not country:
            self.stderr.write(self.style.ERROR("Run seed_geo first (Nepal country missing)."))
            return

        admin_user = User.objects.filter(is_superuser=True).first()
        if not admin_user:
            admin_user = User.objects.create_superuser(
                username="admin",
                email="admin@sunyazon.com",
                password="Admin@12345",
            )
            admin_user.account_type = User.AccountType.SUPER_ADMIN
            admin_user.platform_role = User.PlatformRole.ADMIN
            admin_user.phone = admin_user.phone or "9800000000"
            admin_user.save(update_fields=["account_type", "platform_role", "phone"])
            UserProfile.objects.get_or_create(
                user=admin_user,
                defaults={"full_name": "Sunyazon Administrator"},
            )
            self.stdout.write("  Created default superuser admin / Admin@12345")

        tpl = IndustryTemplate.objects.filter(code="chocolate").first()

        org, _ = Organization.objects.update_or_create(
            slug="sunyazon-foods",
            defaults={
                "tenant": tenant,
                "org_type": Organization.OrgType.MANUFACTURER,
                "account_type": Organization.AccountType.MANUFACTURE,
                "industry_template_code": "chocolate" if tpl else "generic",
                "enabled_capabilities": ["process_engine", "bom", "batch", "warehouse", "qc"],
                "company_name": "Sunyazon Foods Pvt. Ltd.",
                "vat_pan_no": "601234567",
                "official_phone": "+977-1-4000000",
                "official_email": "hello@sunyazonfoods.com",
                "address": "Balaju Industrial Area, Kathmandu",
                "country": country,
                "bank_name": "Nabil Bank",
                "bank_account_no": "0123456789",
                "bank_branch": "Balaju",
                "is_active": True,
                "is_verified": True,
            },
        )
        self.stdout.write(f"  Organization: {org}")

        role, _ = Role.objects.update_or_create(
            organization=org,
            name="Primary Admin",
            defaults={
                "permissions_json": {"*": True},
                "is_system": True,
                "kind": Role.Kind.ADMIN,
            },
        )
        OrgUser.objects.update_or_create(
            organization=org,
            user=admin_user,
            defaults={
                "role": role,
                "role_kind": OrgUser.RoleKind.ADMIN,
                "username": org.vat_pan_no,
                "designation": "CEO",
                "is_primary_admin": True,
            },
        )

        dept, _ = Department.objects.update_or_create(
            organization=org,
            code="PROD",
            defaults={"name": "Production"},
        )
        pos, _ = PositionMaster.objects.update_or_create(
            designation="Production Supervisor",
            defaults={"department": "Production", "min_edu": "Bachelor", "experience": "3 years"},
        )
        employee, _ = Employee.objects.update_or_create(
            organization=org,
            employee_code="EMP-001",
            defaults={
                "user": admin_user,
                "full_name": "Ram Bahadur Thapa",
                "citizenship_no": "12-34-56-78901",
                "pan_no": "123456789",
                "classification": Employee.Classification.PERMANENT,
                "grade": Employee.Grade.G4,
                "department": dept,
                "position": pos,
                "join_date": date.today() - timedelta(days=365),
                "status": Employee.Status.ACTIVE,
            },
        )
        dept.head_employee = employee
        dept.save(update_fields=["head_employee"])

        # Chart of accounts (basic Nepal-style heads)
        coa = [
            ("1000", "Assets", "asset", None),
            ("1100", "Cash & Bank", "asset", "1000"),
            ("1200", "Inventory", "asset", "1000"),
            ("2000", "Liabilities", "liability", None),
            ("3000", "Equity", "equity", None),
            ("4000", "Revenue", "revenue", None),
            ("5000", "Cost of Goods Sold", "cogs", None),
            ("6000", "Operating Expenses", "expense", None),
        ]
        code_map = {}
        for code, name, head, parent_code in coa:
            account, _ = ChartOfAccount.objects.update_or_create(
                organization=org,
                code=code,
                defaults={
                    "name": name,
                    "head_type": head,
                    "parent": code_map.get(parent_code),
                    "is_active": True,
                },
            )
            code_map[code] = account
        self.stdout.write(f"  Chart of accounts: {len(coa)}")

        wh_raw, _ = Warehouse.objects.update_or_create(
            organization=org, code="WH-RAW",
            defaults={"name": "Raw Material Store", "type": Warehouse.Type.RAW, "address": "Block A"},
        )
        Warehouse.objects.update_or_create(
            organization=org, code="WH-FG",
            defaults={"name": "Finished Goods Store", "type": Warehouse.Type.FINISHED, "address": "Block B"},
        )

        vendor, _ = Vendor.objects.update_or_create(
            organization=org,
            vendor_name="Himalayan Cocoa Suppliers",
            defaults={
                "contact": "+977-9800000000",
                "category": "raw_material",
                "quality_rating": 85,
                "delivery_rating": 80,
                "overall_score": 82,
                "pan_vat": "609998877",
                "status": Vendor.Status.ACTIVE,
            },
        )

        cocoa, _ = ItemMaster.objects.update_or_create(
            organization=org, item_code="RM-COCOA",
            defaults={
                "name": "Cocoa Beans",
                "category": ItemMaster.Category.RAW,
                "uom": "kg",
                "min_stock": 100,
                "max_stock": 5000,
                "reorder_level": 250,
                "bin_location": "A-01",
                "supplier": vendor,
            },
        )
        sugar, _ = ItemMaster.objects.update_or_create(
            organization=org, item_code="RM-SUGAR",
            defaults={
                "name": "Sugar",
                "category": ItemMaster.Category.RAW,
                "uom": "kg",
                "min_stock": 50,
                "max_stock": 2000,
                "reorder_level": 100,
                "bin_location": "A-02",
                "supplier": vendor,
            },
        )
        fg_bar, _ = ItemMaster.objects.update_or_create(
            organization=org, item_code="FG-DARK-70",
            defaults={
                "name": "Dark Chocolate 70% Bar",
                "category": ItemMaster.Category.FINISHED,
                "uom": "pcs",
                "min_stock": 200,
                "max_stock": 10000,
                "reorder_level": 500,
                "bin_location": "B-01",
            },
        )
        self.stdout.write(f"  Items: {cocoa.item_code}, {sugar.item_code}, {fg_bar.item_code}")
        _ = wh_raw  # used conceptually as default raw warehouse

        # Second vendor for RFQ comparative quotes
        vendor2, _ = Vendor.objects.update_or_create(
            organization=org,
            vendor_name="Valley Packaging Pvt. Ltd.",
            defaults={
                "contact": "+977-9811111111",
                "category": "packaging",
                "quality_rating": 78,
                "delivery_rating": 88,
                "overall_score": 83,
                "pan_vat": "601112233",
                "status": Vendor.Status.ACTIVE,
            },
        )

        # Sample procurement flow: PR → RFQ → PO → GRN
        prod_dept = (
            Department.objects.filter(organization=org, code__icontains="PROD").first()
            or Department.objects.filter(organization=org).first()
        )
        pr, _ = PurchaseRequisition.objects.update_or_create(
            organization=org,
            pr_no="PR-DEMO-0001",
            defaults={
                "date": timezone.localdate() - timedelta(days=5),
                "department": prod_dept,
                "requested_by": admin_user,
                "status": PurchaseRequisition.Status.SUBMITTED,
            },
        )
        PurchaseRequisitionLine.objects.update_or_create(
            pr=pr,
            material=cocoa,
            defaults={
                "item_code": cocoa.item_code,
                "qty": Decimal("500"),
                "required_date": timezone.localdate() + timedelta(days=7),
            },
        )

        rfq_no = "RFQ-DEMO-0001"
        RFQ.objects.update_or_create(
            organization=org,
            rfq_no=rfq_no,
            supplier=vendor,
            defaults={
                "item": cocoa,
                "qty": Decimal("500"),
                "unit_price": Decimal("420.00"),
                "delivery_days": 5,
                "payment_terms": "Net 30",
                "remarks": "Preferred supplier quote",
            },
        )
        RFQ.objects.update_or_create(
            organization=org,
            rfq_no=rfq_no,
            supplier=vendor2,
            defaults={
                "item": cocoa,
                "qty": Decimal("500"),
                "unit_price": Decimal("405.00"),
                "delivery_days": 10,
                "payment_terms": "Net 45",
                "remarks": "Alternate quote",
            },
        )

        po, _ = PurchaseOrder.objects.update_or_create(
            organization=org,
            po_no="PO-DEMO-0001",
            defaults={
                "supplier": vendor,
                "date": timezone.localdate() - timedelta(days=2),
                "delivery_date": timezone.localdate() + timedelta(days=5),
                "total": Decimal("210000.00"),
                "status": PurchaseOrder.Status.SENT,
            },
        )
        PurchaseOrderLine.objects.update_or_create(
            po=po,
            item=cocoa,
            defaults={
                "qty": Decimal("500"),
                "rate": Decimal("420.00"),
                "amount": Decimal("210000.00"),
            },
        )

        grn, _ = GRN.objects.update_or_create(
            organization=org,
            grn_no="GRN-DEMO-0001",
            defaults={
                "po": po,
                "supplier": vendor,
                "date": timezone.localdate(),
                "status": GRN.Status.DRAFT,
                "qc_status": GRN.QCStatus.PENDING,
                "received_by": admin_user,
            },
        )
        GRNLine.objects.update_or_create(
            grn=grn,
            item=cocoa,
            defaults={
                "ordered_qty": Decimal("500"),
                "received_qty": Decimal("500"),
                "accepted_qty": Decimal("500"),
                "rejected_qty": Decimal("0"),
            },
        )
        self.stdout.write("  Procurement: PR-DEMO-0001, RFQ-DEMO-0001×2, PO-DEMO-0001, GRN-DEMO-0001")

        # Ecommerce category + product
        cat, _ = Category.objects.update_or_create(
            slug="chocolate",
            defaults={"name": "Chocolate", "sort_order": 1, "is_active": True},
        )
        product, _ = Product.objects.update_or_create(
            seller_org=org,
            slug="dark-chocolate-70",
            defaults={
                "category": cat,
                "name": "Sunyazon Dark Chocolate 70%",
                "description": "Artisan dark chocolate bar made in Kathmandu.",
                "condition": Product.Condition.NEW,
                "brand_name": "Sunyazon Foods",
                "model": "DC-70",
                "weight_kg": Decimal("0.100"),
                "price": Decimal("350.00"),
                "currency": "NPR",
                "retail_discount_pct": Decimal("5.00"),
                "stock_qty": Decimal("500"),
                "sku": "SZ-DC-70",
                "barcode": "8901001001001",
                "plan_type": Product.PlanType.SUPER,
                "status": Product.Status.PUBLISHED,
                "ingredients": "Cocoa mass, cocoa butter, sugar, vanilla",
                "whats_in_box": "1 × 100g chocolate bar",
            },
        )
        ProductAttribute.objects.update_or_create(
            product=product, key="cocoa_pct", defaults={"value": "70"},
        )
        ProductAttribute.objects.update_or_create(
            product=product, key="origin", defaults={"value": "Nepal"},
        )
        self.stdout.write(f"  Product: {product}")

        # Process definition from chocolate template
        if tpl:
            proc, _ = ProcessDefinition.objects.update_or_create(
                organization=org,
                code="DARK-BAR",
                defaults={
                    "industry_template": tpl,
                    "name": "Dark Chocolate Bar Line",
                    "description": "Installed from chocolate industry template",
                    "output_type": ProcessDefinition.OutputType.PRODUCT,
                    "default_output_item": fg_bar,
                    "status": ProcessDefinition.Status.ACTIVE,
                    "created_by": admin_user,
                    "version": 1,
                },
            )
            for stage_data in tpl.default_stages_json:
                stage, _ = ProcessStage.objects.update_or_create(
                    process_definition=proc,
                    code=stage_data["code"],
                    defaults={
                        "name": stage_data["name"],
                        "sort_order": stage_data["sort_order"],
                        "stage_type": stage_data.get("stage_type", "custom"),
                        "requires_previous_complete": True,
                    },
                )
                if stage.code == "temper":
                    ProcessStageField.objects.update_or_create(
                        process_stage=stage,
                        field_key="temperature",
                        defaults={
                            "label": "Temperature (°C)",
                            "field_type": ProcessStageField.FieldType.NUMBER,
                            "is_required": True,
                            "validation_json": {"min": 28, "max": 32},
                            "sort_order": 1,
                            "show_on_dashboard": True,
                        },
                    )
            self.stdout.write(f"  Process definition: {proc} ({proc.stages.count()} stages)")

        # Quality (QA/QC) sample records
        IncomingInspection.objects.update_or_create(
            organization=org,
            inspection_no="IQC-DEMO-0001",
            defaults={
                "date": date.today() - timedelta(days=1),
                "supplier": vendor,
                "material": cocoa,
                "batch_no": "RM-B001",
                "parameter": "Moisture",
                "result": "6.2%",
                "status": "hold",
                "inspector": employee,
            },
        )
        IncomingInspection.objects.update_or_create(
            organization=org,
            inspection_no="IQC-DEMO-0002",
            defaults={
                "date": date.today() - timedelta(days=2),
                "supplier": vendor,
                "material": sugar,
                "batch_no": "RM-B002",
                "parameter": "Purity",
                "result": "99.5%",
                "status": "pass",
                "inspector": employee,
            },
        )
        InProcessQC.objects.update_or_create(
            organization=org,
            parameter="Temper temperature",
            batch_no="FG-B100",
            date=date.today(),
            defaults={
                "product": product,
                "process_step": "Temper",
                "standard": "28–32 °C",
                "actual": "pending",
                "status": "hold",
                "inspector": employee,
            },
        )
        FinalQARelease.objects.update_or_create(
            organization=org,
            batch_no="FG-B099",
            defaults={
                "product": product,
                "inspection_date": date.today() - timedelta(days=1),
                "quantity": Decimal("500"),
                "quality_status": "pass",
                "release_status": FinalQARelease.ReleaseStatus.HELD,
                "approved_by": employee,
            },
        )
        LabReport.objects.update_or_create(
            organization=org,
            test_no="LAB-DEMO-0001",
            defaults={
                "sample": "FG-B099",
                "test_parameter": "Cocoa butter",
                "method": "AOAC",
                "specification": "30–35%",
                "result": "32.1%",
                "unit": "%",
                "status": "pass",
            },
        )
        ncr, _ = NCR.objects.update_or_create(
            organization=org,
            ncr_no="NCR-DEMO-0001",
            defaults={
                "date": date.today() - timedelta(days=3),
                "issue": "Moisture out of range on cocoa lot RM-B001",
                "department": dept,
                "root_cause": "Supplier drying variance",
                "correction": "Segregate lot; retest",
                "status": NCR.Status.OPEN,
            },
        )
        CAPA.objects.update_or_create(
            organization=org,
            capa_no="CAPA-DEMO-0001",
            defaults={
                "problem": ncr.issue,
                "root_cause": ncr.root_cause,
                "corrective_action": "Quarantine and re-inspect affected lots",
                "preventive_action": "Add incoming moisture SPC chart",
                "owner": employee,
                "due_date": date.today() + timedelta(days=14),
                "ncr": ncr,
                "status": CAPA.Status.OPEN,
            },
        )
        QualityMaster.objects.update_or_create(
            organization=org,
            quality_parameter="Temper temperature",
            defaults={
                "product": product,
                "specification": "28–32 °C",
                "tolerance": "±0.5 °C",
                "testing_frequency": "Each batch",
            },
        )
        self.stdout.write("  Quality: incoming, IPQC, release, lab, NCR, CAPA, masters")

        consumer, _ = User.objects.update_or_create(
            username="demo_customer",
            defaults={
                "email": "customer@example.com",
                "phone": "+9779801112233",
                "account_type": User.AccountType.CONSUMER,
                "is_active": True,
                "tenant": tenant,
            },
        )
        if not consumer.has_usable_password():
            consumer.set_password("Customer@123")
            consumer.save(update_fields=["password"])
        UserProfile.objects.update_or_create(
            user=consumer,
            defaults={
                "full_name": "Demo Customer",
                "country": country,
                "language_preference": "en",
            },
        )
        self.stdout.write("  Demo customer: demo_customer / Customer@123")

        self.stdout.write(self.style.SUCCESS(
            f"Demo seed complete for {org.company_name} "
            f"(as of {timezone.now():%Y-%m-%d %H:%M})."
        ))
