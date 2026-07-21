"""Sunyazon / BEOS model catalog — assembled from domain modules.

Domain layout mirrors models.md:
    platform        core platform (tenant, workflow, task, audit, notification)
    identity        auth & identity + geo masters (User = AbstractUser)
    organization    companies, roles, departments, meetings
    social          channels, feed, friendship, stories
    media_models    media assets, live streams, playlists
    commerce        ecommerce & seller centre
    payment         gateways, transactions, ads
    documents       documents, templates, blogs
    communication   chat centre, calls, help tickets
    ai              search & AI
    hr              HR & administration
    procurement     vendors, PR, RFQ
    finance         accounts, vouchers, purchase/sales docs, ledgers
    inventory       warehouses, items, stock, GRN
    production      universal Process Engine, BOM, batch, costing
    sales_logistics B2B sales (ASM/DSM/RSM), dispatch, POD
    quality         QA/QC, NCR, CAPA
    crm             complaints, pipeline, activities
    maintenance     equipment, PM, calibration
    analytics       widgets, KPI, reports
"""

from .base import (
    CurrencyField,
    OrgScopedModel,
    TenantScopedModel,
    TimeStampedModel,
    UUIDPrimaryKeyModel,
)
from .platform import (
    Actor,
    Approval,
    AuditLog,
    BusinessObject,
    MetadataForm,
    Notification,
    Policy,
    Rule,
    Task,
    Tenant,
    WorkflowDefinition,
    WorkflowInstance,
)
from .identity import (
    Address,
    Country,
    District,
    KYCDocument,
    Municipality,
    Province,
    Session,
    User,
    UserProfile,
)
from .organization import (
    BoardDeclaration,
    Branch,
    CompanyDocument,
    CompanyLeadershipSeat,
    Department,
    LeadershipRoleDefinition,
    Meeting,
    MeetingAttendee,
    Module,
    Organization,
    OrgUser,
    Role,
    RoleModulePermission,
    Shareholder,
    Team,
)
from .social import (
    FeedEngagement,
    FeedMedia,
    FeedPost,
    FeedProductLink,
    FriendSuggestion,
    Friendship,
    LiveMarketSession,
    OnlinePresence,
    PlatformChannel,
    Story,
    ThoughtPortal,
    UserChannelSubscription,
    WeatherWidgetCache,
)
from .media_models import (
    LiveStream,
    LiveViewer,
    MediaAsset,
    MediaPlaylist,
    PlaylistItem,
)
from .commerce import (
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
from .payment import (
    AdCampaign,
    AdImpression,
    AdPlan,
    PaymentGateway,
    PaymentTransaction,
)
from .documents import BlogPost, Document, DocumentTemplate
from .communication import (
    CallSession,
    ChatMessage,
    ChatParticipant,
    ChatThread,
    HelpTicket,
)
from .ai import (
    EmbeddingIndex,
    ImageMatchResult,
    SearchQueryLog,
    VoiceTranscript,
)
from .hr import (
    Attendance,
    Employee,
    EmployeeOnboardingTask,
    JobApplicant,
    JobVacancy,
    LeaveRequest,
    OnboardingProcess,
    PayrollLine,
    PayrollRun,
    PositionMaster,
    SelectionScoring,
    TrainingLog,
)
from .procurement import (
    RFQ,
    PurchaseRequisition,
    PurchaseRequisitionLine,
    Vendor,
)
from .finance import (
    ActionPlan,
    CashBankAccount,
    ChartOfAccount,
    CreditNote,
    DayBook,
    DebitNote,
    DocStatus,
    IncomeExpense,
    IssueCheque,
    JournalLine,
    JournalVoucher,
    Ledger,
    PaymentMode,
    ProfitLossSnapshot,
    Purchase,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchasePayment,
    Sales,
    SalesOrder,
    SalesOrderLine,
    SalesReceived,
    TaxAuditRecord,
)
from .inventory import (
    GRN,
    GRNLine,
    ItemMaster,
    MaterialIssue,
    MaterialIssueLine,
    StockAdjustment,
    StockLedger,
    Warehouse,
)
from .production import (
    BOM,
    Batch,
    BOMLine,
    DamageExpire,
    IndustryTemplate,
    ProcessDefinition,
    ProcessFieldValue,
    ProcessRun,
    ProcessRunLine,
    ProcessRunStage,
    ProcessStage,
    ProcessStageField,
    ProductionCosting,
    RegisterBook,
    WIPTracking,
    WorkingReport,
    WorkOrder,
)
from .sales_logistics import (
    ASMOrder,
    DealerSalesLine,
    DealerSalesOrder,
    Dispatch,
    Party,
    POD,
    PromotionScheme,
    RetailSalesLine,
    RetailSalesOrder,
    ReturnOrder,
    Route,
    Territory,
    Vehicle,
)
from .quality import (
    CAPA,
    FinalQARelease,
    IncomingInspection,
    InProcessQC,
    LabReport,
    NCR,
    QualityMaster,
)
from .crm import Complaint, CustomerActivity, PipelineDeal
from .maintenance import (
    Calibration,
    Equipment,
    MaintenanceWorkOrder,
    PMSchedule,
)
from .analytics import DashboardWidget, KPISnapshot, ReportDefinition
from .enterprise import (
    ActivityLog,
    AppSetting,
    DEFAULT_PERMISSION_ACTIONS,
    Holiday,
    MenuItem,
    PermissionAction,
    Project,
    TaskAttachment,
    TaskCategory,
    TaskComment,
    TaskHistory,
    TaskLabel,
    TaskStatus,
)
