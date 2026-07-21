"""Ecommerce and seller centre models."""

from __future__ import annotations

from django.db import models

from .base import CurrencyField, TimeStampedModel, UUIDPrimaryKeyModel


class Category(UUIDPrimaryKeyModel):
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    image = models.ImageField(upload_to="commerce/categories/", blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Product(UUIDPrimaryKeyModel, TimeStampedModel):
    class Condition(models.TextChoices):
        NEW = "new", "New"
        USED = "used", "Used"
        REFURBISHED = "refurbished", "Refurbished"

    class PlanType(models.TextChoices):
        BASIC = "basic", "Basic"
        SUPER = "super", "Super"
        DROPSHIPPER = "dropshipper", "Dropshipper"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    seller_org = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="products",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True)
    condition = models.CharField(
        max_length=16,
        choices=Condition.choices,
        default=Condition.NEW,
    )
    brand_name = models.CharField(max_length=255, blank=True)
    model = models.CharField(max_length=255, blank=True)
    batch_no = models.CharField(max_length=64, blank=True)
    certified_no = models.CharField(max_length=64, blank=True)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    height_cm = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    length_cm = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    width_cm = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ingredients = models.TextField(blank=True)
    attributes_json = models.JSONField(default=dict, blank=True)
    how_where_used = models.TextField(blank=True)
    whats_in_box = models.TextField(blank=True)
    caution = models.TextField(blank=True)
    product_video = models.FileField(upload_to="commerce/products/videos/", blank=True, null=True)
    product_video_url = models.URLField(blank=True)
    price = CurrencyField()
    currency = models.CharField(max_length=8, default="NPR")
    retail_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    delivery_from_pay = CurrencyField()
    delivery_to_pay = CurrencyField()
    manufacture_date = models.DateField(null=True, blank=True)
    expire_date = models.DateField(null=True, blank=True)
    stock_qty = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    sku = models.CharField(max_length=64, blank=True, db_index=True)
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    plan_type = models.CharField(
        max_length=16,
        choices=PlanType.choices,
        default=PlanType.BASIC,
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("seller_org", "slug")]

    def __str__(self):
        return self.name


class ProductImage(UUIDPrimaryKeyModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image = models.ImageField(upload_to="commerce/products/images/")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.product} image #{self.sort_order}"


class ProductAttribute(UUIDPrimaryKeyModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="attributes",
    )
    key = models.CharField(max_length=128)
    value = models.CharField(max_length=512)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return f"{self.key}: {self.value}"


class Cart(UUIDPrimaryKeyModel):
    user = models.OneToOneField(
        "core.User",
        on_delete=models.CASCADE,
        related_name="cart",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart ({self.user})"


class CartItem(UUIDPrimaryKeyModel):
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="cart_items",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3, default=1)
    unit_price = CurrencyField()

    class Meta:
        unique_together = [("cart", "product")]

    def __str__(self):
        return f"{self.qty} × {self.product}"


class Order(UUIDPrimaryKeyModel, TimeStampedModel):
    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    class OrderStatus(models.TextChoices):
        PLACED = "placed", "Placed"
        CONFIRMED = "confirmed", "Confirmed"
        PACKED = "packed", "Packed"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        RETURNED = "returned", "Returned"

    order_no = models.CharField(max_length=64, unique=True)
    buyer_user = models.ForeignKey(
        "core.User",
        on_delete=models.PROTECT,
        related_name="orders",
    )
    seller_org = models.ForeignKey(
        "core.Organization",
        on_delete=models.PROTECT,
        related_name="orders",
    )
    subtotal = CurrencyField()
    discount = CurrencyField()
    delivery_fee = CurrencyField()
    tax = CurrencyField()
    total = CurrencyField()
    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        db_index=True,
    )
    order_status = models.CharField(
        max_length=16,
        choices=OrderStatus.choices,
        default=OrderStatus.PLACED,
        db_index=True,
    )
    shipping_address = models.ForeignKey(
        "core.Address",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.order_no


class OrderItem(UUIDPrimaryKeyModel):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="order_items",
    )
    qty = models.DecimalField(max_digits=14, decimal_places=3)
    unit_price = CurrencyField()
    amount = CurrencyField()
    discount = CurrencyField()

    def __str__(self):
        return f"{self.order.order_no} — {self.product}"


class Review(UUIDPrimaryKeyModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="reviews",
    )
    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="product_reviews",
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("product", "user")]

    def __str__(self):
        return f"{self.product} — {self.rating}★ by {self.user}"


class PickDropRequest(UUIDPrimaryKeyModel):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        ASSIGNED = "assigned", "Assigned"
        IN_TRANSIT = "in_transit", "In Transit"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(
        "core.User",
        on_delete=models.CASCADE,
        related_name="pick_drop_requests",
    )
    pickup_address = models.TextField()
    drop_address = models.TextField()
    item_description = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.REQUESTED,
        db_index=True,
    )
    assigned_driver = models.ForeignKey(
        "core.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_pick_drops",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Pick/Drop {self.user} — {self.status}"


class NearestShop(UUIDPrimaryKeyModel):
    org = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="nearest_shops",
    )
    name = models.CharField(max_length=255)
    lat = models.DecimalField(max_digits=10, decimal_places=7)
    lng = models.DecimalField(max_digits=10, decimal_places=7)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
