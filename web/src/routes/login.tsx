import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Phone, Lock, ArrowRight, User, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Sunyazon BEOS" },
      { name: "description", content: "Sign in or create an account to access your Sunyazon portal." },
    ],
  }),
  component: LoginPage,
});

type Mode = "login" | "register";

type FieldErrors = Partial<
  Record<"full_name" | "phone" | "email" | "password" | "password_confirm" | "account_type", string>
>;

const ACCOUNT_TYPES = [
  { value: "default", label: "Default", hint: "Job applicant / consumer" },
  { value: "producer", label: "Producer", hint: "Requires company registration" },
  { value: "distributor", label: "Distributor", hint: "Requires company registration" },
  { value: "wholesaler", label: "Wholesaler", hint: "Requires company registration" },
  { value: "retailer", label: "Retailer", hint: "Requires company registration" },
] as const;

function firstFieldError(errors?: Record<string, string[]>): FieldErrors {
  if (!errors) return {};
  const out: FieldErrors = {};
  for (const key of ["full_name", "phone", "email", "password", "password_confirm"] as const) {
    const msgs = errors[key];
    if (msgs?.length) out[key] = msgs[0];
  }
  return out;
}

function LoginPage() {
  const { login, register, user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [accountType, setAccountType] = useState<string>("default");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (user.portal.redirect_to === "/register/company") {
        void navigate({ to: "/register/company" });
        return;
      }
      void navigate({ to: user.portal.redirect_to || "/apps" });
    }
  }, [loading, user, navigate]);

  const isRegister = mode === "register";

  const inputClass = useMemo(
    () =>
      "w-full h-11 pl-10 pr-3 rounded-xl bg-white/5 border text-white placeholder:text-white/30 outline-none focus:border-[#F25C05]/70 focus:ring-2 focus:ring-[#F25C05]/25 transition",
    [],
  );

  function borderFor(field: keyof FieldErrors) {
    return fieldErrors[field] ? "border-red-500/50" : "border-white/10";
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setPassword("");
    setPasswordConfirm("");
    setShowPw(false);
    setShowPwConfirm(false);
  }

  function validateClient(): FieldErrors {
    const errs: FieldErrors = {};
    const phoneDigits = phone.replace(/[^\d+]/g, "").trim();

    if (isRegister) {
      if (!fullName.trim() || fullName.trim().length < 2) {
        errs.full_name = "Please enter your full name.";
      }
      if (!ACCOUNT_TYPES.some((t) => t.value === accountType)) {
        errs.account_type = "Select an account type.";
      }
    }

    if (!phoneDigits) {
      errs.phone = "Phone number is required.";
    } else if (!/^\+?\d{8,15}$/.test(phoneDigits)) {
      errs.phone = "Enter a valid phone number (8–15 digits).";
    }

    if (isRegister && email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errs.email = "Enter a valid email address.";
      }
    }

    if (!password) {
      errs.password = "Password is required.";
    } else if (isRegister && password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }

    if (isRegister) {
      if (!passwordConfirm) {
        errs.password_confirm = "Please confirm your password.";
      } else if (password !== passwordConfirm) {
        errs.password_confirm = "Passwords do not match.";
      }
    }

    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length) {
      setFieldErrors(clientErrors);
      setError(Object.values(clientErrors)[0] ?? "Please fix the highlighted fields.");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isRegister) {
        const u = await register({
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          password,
          password_confirm: passwordConfirm,
          account_type: accountType,
        });
        const needsCompany =
          u.needs_company_registration ||
          ["producer", "distributor", "wholesaler", "retailer"].includes(accountType);
        if (needsCompany) {
          setSuccess("Account created. Continue with company registration…");
          await navigate({ to: "/register/company" });
        } else {
          setSuccess("Account created. Taking you to your portal…");
          await navigate({ to: u.portal.redirect_to || "/apps" });
        }
      } else {
        const u = await login(phone.trim(), password, remember);
        await navigate({ to: u.portal.redirect_to || "/apps" });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = firstFieldError(err.errors);
        setFieldErrors(mapped);
        setError(err.message || "Unable to complete request.");
      } else {
        setError(isRegister ? "Unable to create account." : "Unable to sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(242,92,5,0.28), transparent 55%)," +
            "radial-gradient(ellipse 70% 50% at 90% 80%, rgba(255,111,31,0.18), transparent 50%)," +
            "linear-gradient(165deg, #0A0A0A 0%, #14110E 45%, #1A120C 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23F25C05' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div
            className="mx-auto h-14 w-14 rounded-2xl grid place-items-center font-black text-xl shadow-lg mb-4"
            style={{
              background: "linear-gradient(135deg, #F25C05, #FF8A3D)",
              color: "#111",
              boxShadow: "0 12px 40px rgba(242,92,5,0.35)",
            }}
          >
            S
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white">Sunyazon</h1>
          <p className="mt-1 text-sm text-white/55">Business Ecosystem Operating System</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 sm:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-700"
          noValidate
        >
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`h-9 rounded-lg text-sm font-medium transition ${
                !isRegister ? "bg-[#F25C05] text-black" : "text-white/60 hover:text-white/90"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`h-9 rounded-lg text-sm font-medium transition ${
                isRegister ? "bg-[#F25C05] text-black" : "text-white/60 hover:text-white/90"
              }`}
            >
              Create account
            </button>
          </div>

          <h2 className="text-lg font-semibold text-white mb-1">
            {isRegister ? "Create account" : "Sign in"}
          </h2>
          <p className="text-sm text-white/50 mb-6">
            {isRegister
              ? "Register with your phone number. You’ll be signed in automatically."
              : "Use your phone number and password."}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
            >
              {success}
            </div>
          )}

          {isRegister && (
            <>
              <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="reg-name">
                Full name
              </label>
              <div className="relative mb-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.full_name) setFieldErrors((f) => ({ ...f, full_name: undefined }));
                  }}
                  placeholder="Your full name"
                  className={`${inputClass} ${borderFor("full_name")}`}
                  aria-invalid={!!fieldErrors.full_name}
                />
              </div>
              {fieldErrors.full_name && (
                <p className="mb-3 text-xs text-red-300">{fieldErrors.full_name}</p>
              )}
              {!fieldErrors.full_name && <div className="mb-3" />}

              <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="reg-account-type">
                Account type
              </label>
              <select
                id="reg-account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className={`${inputClass} pl-3 mb-1 ${fieldErrors.account_type ? "border-red-500/50" : "border-white/10"}`}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-[#1a120c] text-white">
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mb-3 text-[11px] text-white/35">
                {ACCOUNT_TYPES.find((t) => t.value === accountType)?.hint}
              </p>
            </>
          )}

          <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="auth-phone">
            Phone number
          </label>
          <div className="relative mb-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
            <input
              id="auth-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined }));
              }}
              placeholder="98XXXXXXXX"
              className={`${inputClass} ${borderFor("phone")}`}
              aria-invalid={!!fieldErrors.phone}
            />
          </div>
          {fieldErrors.phone ? (
            <p className="mb-3 text-xs text-red-300">{fieldErrors.phone}</p>
          ) : (
            <div className="mb-3" />
          )}

          {isRegister && (
            <>
              <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="reg-email">
                Email <span className="text-white/35">(optional)</span>
              </label>
              <div className="relative mb-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  className={`${inputClass} ${borderFor("email")}`}
                  aria-invalid={!!fieldErrors.email}
                />
              </div>
              {fieldErrors.email ? (
                <p className="mb-3 text-xs text-red-300">{fieldErrors.email}</p>
              ) : (
                <div className="mb-3" />
              )}
            </>
          )}

          <label className="block text-xs font-medium text-white/60 mb-1.5" htmlFor="auth-password">
            Password
          </label>
          <div className="relative mb-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
            <input
              id="auth-password"
              type={showPw ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
              placeholder="••••••••"
              className={`${inputClass} pr-11 ${borderFor("password")}`}
              aria-invalid={!!fieldErrors.password}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label="Toggle password visibility"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password ? (
            <p className="mb-3 text-xs text-red-300">{fieldErrors.password}</p>
          ) : isRegister ? (
            <p className="mb-3 text-[11px] text-white/35">At least 8 characters. Avoid common passwords.</p>
          ) : (
            <label className="mb-5 flex items-center gap-2 text-xs text-white/55 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-[#F25C05]"
              />
              Remember me on this device
            </label>
          )}

          {isRegister && (
            <>
              <label
                className="block text-xs font-medium text-white/60 mb-1.5"
                htmlFor="reg-password-confirm"
              >
                Confirm password
              </label>
              <div className="relative mb-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
                <input
                  id="reg-password-confirm"
                  type={showPwConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    if (fieldErrors.password_confirm) {
                      setFieldErrors((f) => ({ ...f, password_confirm: undefined }));
                    }
                  }}
                  placeholder="••••••••"
                  className={`${inputClass} pr-11 ${borderFor("password_confirm")}`}
                  aria-invalid={!!fieldErrors.password_confirm}
                />
                <button
                  type="button"
                  onClick={() => setShowPwConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  aria-label="Toggle confirm password visibility"
                >
                  {showPwConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password_confirm ? (
                <p className="mb-5 text-xs text-red-300">{fieldErrors.password_confirm}</p>
              ) : (
                <div className="mb-5" />
              )}
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #F25C05, #FF6F1F)", color: "#111" }}
          >
            {submitting
              ? isRegister
                ? "Creating account…"
                : "Signing in…"
              : isRegister
                ? "Create account"
                : "Sign in"}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>

          {!isRegister && (
            <p className="mt-5 text-[11px] text-white/35 text-center leading-relaxed">
              Demo: 9800000001 Super Admin · 9800000002 Consumer · 9800000003 Producer Admin ·
              9800000004 Multi-module Staff · 9800000005 Inventory Staff
            </p>
          )}

          <p className="mt-5 text-center text-sm text-white/45">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-[#FF8A3D] hover:underline underline-offset-2"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-[#FF8A3D] hover:underline underline-offset-2"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          <Link to="/" className="hover:text-white/70 underline-offset-2 hover:underline">
            Continue as guest preview
          </Link>
        </p>
      </div>
    </div>
  );
}
