"""Admin for ecommerce — products with image galleries, orders with item inlines."""

from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from core.models import (
    Cart,
    CartItem,
    Category,
    NearestShop,
    Order,
    OrderItem,
    PickDropRequest,
    Product,
    ProductAttribute,
    ProductImage,
    Review,
)

from .base import BaseAdmin, badge, bool_badge, choice_badge, image_thumb, money


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    max_num = 6
    fields = ("preview", "image", "sort_order")
    readonly_fields = ("preview",)

    @admin.display(description="Preview")
    def preview(self, obj):
        return image_thumb(obj.image, size=64)


class ProductAttributeInline(admin.TabularInline):
    model = ProductAttribute
    extra = 1
    fields = ("key", "value")


class ReviewInline(admin.StackedInline):
    model = Review
    extra = 0
    fields = (("user", "rating"), "comment", "created_at")
    readonly_fields = ("created_at",)
    autocomplete_fields = ["user"]


@admin.register(Product)
class ProductAdmin(BaseAdmin):
    inlines = [ProductImageInline, ProductAttributeInline, ReviewInline]
    list_display = (
        "cover_thumb",
        "name",
        "seller_org",
        "category",
        "price_col",
        "discount_col",
        "stock_col",
        "condition_badge",
        "plan_badge",
        "status_badge",
        "rating_col",
        "created_at",
    )
    list_display_links = ("cover_thumb", "name")
    list_filter = ("status", "condition", "plan_type", "category", "currency")
    search_fields = ("name", "slug", "sku", "barcode", "brand_name", "seller_org__company_name")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["seller_org", "category"]
    date_hierarchy = "created_at"
    list_select_related = ("seller_org", "category")
    actions = ["publish_products", "archive_products"]

    fieldsets = (
        ("Basics", {
            "fields": (
                ("name", "slug"),
                ("seller_org", "category"),
                "description",
                ("condition", "plan_type", "status"),
            ),
        }),
        ("Identification", {
            "fields": (("brand_name", "model"), ("sku", "barcode"), ("batch_no", "certified_no")),
        }),
        ("Pricing & Stock", {
            "fields": (
                ("price", "currency", "retail_discount_pct"),
                ("delivery_from_pay", "delivery_to_pay"),
                "stock_qty",
                ("manufacture_date", "expire_date"),
            ),
        }),
        ("Dimensions", {
            "classes": ("collapse",),
            "fields": (("weight_kg", "height_cm"), ("length_cm", "width_cm")),
        }),
        ("Details", {
            "classes": ("collapse",),
            "fields": ("ingredients", "how_where_used", "whats_in_box", "caution", "attributes_json"),
        }),
        ("Media", {"fields": ("product_video", "product_video_url")}),
    )

    @admin.display(description="Image")
    def cover_thumb(self, obj):
        first = obj.images.order_by("sort_order").first()
        return image_thumb(first.image if first else None, size=44)

    @admin.display(description="Price", ordering="price")
    def price_col(self, obj):
        return money(obj.price, obj.currency)

    @admin.display(description="Discount", ordering="retail_discount_pct")
    def discount_col(self, obj):
        if not obj.retail_discount_pct:
            return "—"
        return badge(f"-{obj.retail_discount_pct}%", "#fd7e14")

    @admin.display(description="Stock", ordering="stock_qty")
    def stock_col(self, obj):
        qty = obj.stock_qty or 0
        color = "#198754" if qty > 10 else "#fd7e14" if qty > 0 else "#dc3545"
        return badge(f"{qty:g} in stock" if qty else "Out of stock", color)

    @admin.display(description="Condition", ordering="condition")
    def condition_badge(self, obj):
        return choice_badge(obj, "condition")

    @admin.display(description="Plan", ordering="plan_type")
    def plan_badge(self, obj):
        return choice_badge(obj, "plan_type")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")

    @admin.display(description="Rating")
    def rating_col(self, obj):
        reviews = list(obj.reviews.all())
        if not reviews:
            return "—"
        avg = sum(r.rating for r in reviews) / len(reviews)
        stars = "★" * round(avg) + "☆" * (5 - round(avg))
        return format_html(
            '<span style="color:#ffc107;font-size:13px;">{}</span> <small>({})</small>',
            stars, len(reviews),
        )

    @admin.action(description="Publish selected products")
    def publish_products(self, request, queryset):
        updated = queryset.update(status=Product.Status.PUBLISHED)
        self.message_user(request, f"{updated} product(s) published.")

    @admin.action(description="Archive selected products")
    def archive_products(self, request, queryset):
        updated = queryset.update(status=Product.Status.ARCHIVED)
        self.message_user(request, f"{updated} product(s) archived.")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("images", "reviews")


class SubCategoryInline(admin.TabularInline):
    model = Category
    fk_name = "parent"
    extra = 0
    fields = ("name", "slug", "sort_order", "is_active")
    prepopulated_fields = {"slug": ("name",)}
    show_change_link = True


@admin.register(Category)
class CategoryAdmin(BaseAdmin):
    inlines = [SubCategoryInline]
    list_display = ("image_col", "name", "parent", "product_count", "sort_order", "active_col")
    list_display_links = ("image_col", "name")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["parent"]
    list_editable = ("sort_order",)

    @admin.display(description="Image")
    def image_col(self, obj):
        return image_thumb(obj.image, size=38)

    @admin.display(description="Products")
    def product_count(self, obj):
        return obj.products.count()

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Active", "Hidden")


class OrderItemInline(admin.StackedInline):
    """Order → Order Item, per spec example of stacked inline relations."""

    model = OrderItem
    extra = 1
    autocomplete_fields = ["product"]
    fieldsets = (
        (None, {"fields": (("product", "qty"), ("unit_price", "discount", "amount"))}),
    )


@admin.register(Order)
class OrderAdmin(BaseAdmin):
    inlines = [OrderItemInline]
    list_display = (
        "order_no",
        "buyer_user",
        "seller_org",
        "items_col",
        "subtotal_col",
        "total_col",
        "payment_badge",
        "status_badge",
        "created_at",
    )
    list_filter = ("order_status", "payment_status", "seller_org")
    search_fields = ("order_no", "buyer_user__username", "seller_org__company_name")
    date_hierarchy = "created_at"
    autocomplete_fields = ["buyer_user", "seller_org", "shipping_address"]
    list_select_related = ("buyer_user", "seller_org")
    readonly_fields = ("created_at", "updated_at")
    actions = ["mark_confirmed", "mark_shipped", "mark_delivered"]

    fieldsets = (
        ("Order", {"fields": (("order_no",), ("buyer_user", "seller_org"), "shipping_address")}),
        ("Amounts", {
            "fields": (("subtotal", "discount"), ("delivery_fee", "tax"), "total"),
        }),
        ("Status", {"fields": (("payment_status", "order_status"), ("created_at", "updated_at"))}),
    )

    @admin.display(description="Items")
    def items_col(self, obj):
        return badge(f"{obj.items.count()} items", "#0d6efd")

    @admin.display(description="Subtotal", ordering="subtotal")
    def subtotal_col(self, obj):
        return money(obj.subtotal)

    @admin.display(description="Total", ordering="total")
    def total_col(self, obj):
        return money(obj.total)

    @admin.display(description="Payment", ordering="payment_status")
    def payment_badge(self, obj):
        return choice_badge(obj, "payment_status")

    @admin.display(description="Status", ordering="order_status")
    def status_badge(self, obj):
        return choice_badge(obj, "order_status")

    @admin.action(description="Mark selected orders as Confirmed")
    def mark_confirmed(self, request, queryset):
        self.message_user(request, f"{queryset.update(order_status=Order.OrderStatus.CONFIRMED)} order(s) confirmed.")

    @admin.action(description="Mark selected orders as Shipped")
    def mark_shipped(self, request, queryset):
        self.message_user(request, f"{queryset.update(order_status=Order.OrderStatus.SHIPPED)} order(s) shipped.")

    @admin.action(description="Mark selected orders as Delivered")
    def mark_delivered(self, request, queryset):
        self.message_user(request, f"{queryset.update(order_status=Order.OrderStatus.DELIVERED)} order(s) delivered.")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("items")


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    autocomplete_fields = ["product"]


@admin.register(Cart)
class CartAdmin(BaseAdmin):
    inlines = [CartItemInline]
    list_display = ("user", "item_count", "cart_value", "updated_at")
    search_fields = ("user__username",)
    autocomplete_fields = ["user"]
    list_select_related = ("user",)

    @admin.display(description="Items")
    def item_count(self, obj):
        return obj.items.count()

    @admin.display(description="Value")
    def cart_value(self, obj):
        return money(sum(i.qty * i.unit_price for i in obj.items.all()))

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("items")


@admin.register(Review)
class ReviewAdmin(BaseAdmin):
    list_display = ("product", "user", "stars_col", "comment", "created_at")
    list_filter = ("rating",)
    search_fields = ("product__name", "user__username", "comment")
    date_hierarchy = "created_at"
    autocomplete_fields = ["product", "user"]
    list_select_related = ("product", "user")

    @admin.display(description="Rating", ordering="rating")
    def stars_col(self, obj):
        return format_html(
            '<span style="color:#ffc107;font-size:14px;">{}</span>',
            "★" * obj.rating + "☆" * (5 - obj.rating),
        )


@admin.register(PickDropRequest)
class PickDropRequestAdmin(BaseAdmin):
    list_display = ("user", "pickup_address", "drop_address", "status_badge", "assigned_driver", "created_at")
    list_filter = ("status",)
    search_fields = ("user__username", "pickup_address", "drop_address")
    date_hierarchy = "created_at"
    autocomplete_fields = ["user", "assigned_driver"]
    list_select_related = ("user", "assigned_driver")

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        return choice_badge(obj, "status")


@admin.register(NearestShop)
class NearestShopAdmin(BaseAdmin):
    list_display = ("name", "org", "address", "lat", "lng", "active_col")
    list_filter = ("is_active",)
    search_fields = ("name", "org__company_name", "address")
    autocomplete_fields = ["org"]
    list_select_related = ("org",)

    @admin.display(description="Active", ordering="is_active")
    def active_col(self, obj):
        return bool_badge(obj.is_active, "Open", "Closed")
