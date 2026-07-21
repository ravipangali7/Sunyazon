"""Enterprise API URL routing (ViewSets + auth extras)."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core.api.views import (
    ActivityLogViewSet,
    ApprovalViewSet,
    ChangePasswordView,
    CompanyViewSet,
    DepartmentViewSet,
    EnterpriseDashboardView,
    GlobalSearchView,
    HolidayViewSet,
    MenuViewSet,
    ModuleViewSet,
    NotificationViewSet,
    ProfileView,
    ProjectViewSet,
    RefreshTokenView,
    ReportView,
    RoleViewSet,
    SettingViewSet,
    TaskCategoryViewSet,
    TaskLabelViewSet,
    TaskStatusViewSet,
    TaskViewSet,
    TeamViewSet,
    TodayMissionView,
    UserViewSet,
    WorkflowViewSet,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="enterprise-users")
router.register(r"companies", CompanyViewSet, basename="enterprise-companies")
router.register(r"departments", DepartmentViewSet, basename="enterprise-departments")
router.register(r"teams", TeamViewSet, basename="enterprise-teams")
router.register(r"roles", RoleViewSet, basename="enterprise-roles")
router.register(r"menus", MenuViewSet, basename="enterprise-menus")
router.register(r"modules", ModuleViewSet, basename="enterprise-modules")
router.register(r"task-statuses", TaskStatusViewSet, basename="enterprise-task-statuses")
router.register(r"task-categories", TaskCategoryViewSet, basename="enterprise-task-categories")
router.register(r"projects", ProjectViewSet, basename="enterprise-projects")
router.register(r"task-labels", TaskLabelViewSet, basename="enterprise-task-labels")
router.register(r"v2/tasks", TaskViewSet, basename="enterprise-tasks")
router.register(r"approvals", ApprovalViewSet, basename="enterprise-approvals")
router.register(r"workflows", WorkflowViewSet, basename="enterprise-workflows")
router.register(r"v2/notifications", NotificationViewSet, basename="enterprise-notifications")
router.register(r"activity-logs", ActivityLogViewSet, basename="enterprise-activity-logs")
router.register(r"settings", SettingViewSet, basename="enterprise-settings")
router.register(r"holidays", HolidayViewSet, basename="enterprise-holidays")

urlpatterns = [
    path("auth/refresh/", RefreshTokenView.as_view(), name="auth-refresh"),
    path("auth/profile/", ProfileView.as_view(), name="auth-profile"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("v2/dashboard/", EnterpriseDashboardView.as_view(), name="enterprise-dashboard"),
    path("today-mission/", TodayMissionView.as_view(), name="today-mission"),
    path("reports/", ReportView.as_view(), name="reports"),
    path("", include(router.urls)),
]
