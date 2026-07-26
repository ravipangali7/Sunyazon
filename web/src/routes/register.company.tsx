import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  FileText,
  Users,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { companyApi, type ShareholderInput } from "@/lib/company-api";

export const Route = createFileRoute("/register/company")({
  head: () => ({
    meta: [
      { title: "Company Registration — Sunyazon BEOS" },
      {
        name: "description",
        content:
          "Register a PVT LTD or NON PVT LTD company for Producer, Distributor, Wholesaler, or Retailer accounts.",
      },
    ],
  }),
  component: CompanyRegistrationPage,
});

type Mode = "pvt_ltd" | "non_pvt_ltd";

type ShareholderRow = ShareholderInput & { key: string };

const emptyShareholder = (): ShareholderRow => ({
  key: Math.random().toString(36).slice(2),
  full_name: "",
  share_units: 0,
  percentage: 0,
  is_default: false,
});

function CompanyRegistrationPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("pvt_ltd");
  const [companyName, setCompanyName] = useState("");
  const [pan, setPan] = useState("");
  const [mdName, setMdName] = useState("");
  const [totalCapital, setTotalCapital] = useState("");
  const [address, setAddress] = useState("");
  const [shareholders, setShareholders] = useState<ShareholderRow[]>([
    { ...emptyShareholder(), is_default: true },
  ]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    const business = ["producer", "distributor", "wholesaler", "retailer"].includes(
      user.account_type,
    );
    if (!business) {
      void navigate({ to: user.portal.redirect_to || "/customer" });
      return;
    }
    if (user.membership) {
      void navigate({ to: user.portal.redirect_to || "/apps" });
    }
  }, [loading, user, navigate]);

  const steps = useMemo(() => {
    if (mode === "non_pvt_ltd") {
      return ["Company type", "Company details", "Review"];
    }
    return ["Company type", "Company details", "Shareholders", "Review"];
  }, [mode]);

  useEffect(() => {
    setStep((s) => Math.min(s, steps.length - 1));
  }, [steps.length]);

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
    setLookupMsg(null);
    setStep(0);
  }

  function validateBeforeContinue(): boolean {
    setError(null);
    if (step === 1) {
      if (!companyName.trim()) {
        setError("Company name is required.");
        return false;
      }
      if (mode === "non_pvt_ltd") {
        if (!pan.trim()) {
          setError("PAN number is required.");
          return false;
        }
        if (!mdName.trim()) {
          setError("MD (Managing Director) is required.");
          return false;
        }
      }
    }
    if (step === 2 && mode === "pvt_ltd") {
      const named = shareholders.filter((s) => s.full_name.trim());
      if (!named.length) {
        setError("Add at least one shareholder with a name.");
        return false;
      }
    }
    return true;
  }

  async function lookupPan() {
    setLookupMsg(null);
    if (!pan.trim()) return;
    try {
      const res = await companyApi.lookup(pan.trim());
      if (res.found && res.organization) {
        setCompanyName(res.organization.company_name);
        setLookupMsg(`Found: ${res.organization.company_name}`);
      } else {
        setLookupMsg("No existing company with this PAN — a new org profile will be created.");
      }
    } catch (e) {
      setLookupMsg(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  function updateShareholder(key: string, patch: Partial<ShareholderRow>) {
    setShareholders((rows) =>
      rows.map((r) => {
        if (r.key !== key) {
          if (patch.is_default) return { ...r, is_default: false };
          return r;
        }
        return { ...r, ...patch };
      }),
    );
  }

  async function submit() {
    if (!user) return;
    setError(null);
    setSubmitting(true);
    try {
      if (!companyName.trim()) throw new Error("Company name is required.");
      if (mode === "non_pvt_ltd") {
        if (!pan.trim()) throw new Error("PAN number is required for NON PVT LTD companies.");
        if (!mdName.trim()) throw new Error("MD (Managing Director) is required.");
      }
      const res = await companyApi.register({
        account_type: user.account_type,
        registration_mode: mode,
        company_name: companyName.trim(),
        pan_number: pan.trim() || undefined,
        managing_director_name: mode === "non_pvt_ltd" ? mdName.trim() : undefined,
        total_capital: mode === "pvt_ltd" ? totalCapital || "0" : undefined,
        address: mode === "pvt_ltd" ? address : undefined,
        shareholders:
          mode === "pvt_ltd"
            ? shareholders.map(({ full_name, share_units, percentage, is_default }) => ({
                full_name,
                share_units,
                percentage,
                is_default,
              }))
            : undefined,
      });
      await refresh();
      const redirect =
        (res.user as { portal?: { redirect_to?: string } })?.portal?.redirect_to ||
        `/portal/${user.account_type}`;
      await navigate({ to: redirect });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-[#F25C05]/70";

  const reviewStep = steps.length - 1;

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0A0A0A] text-white/60">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen relative px-4 py-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(242,92,5,0.22), transparent 55%)," +
            "linear-gradient(165deg, #0A0A0A 0%, #14110E 45%, #1A120C 100%)",
        }}
      />
      <div className="relative max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div
            className="mx-auto h-12 w-12 rounded-2xl grid place-items-center font-black shadow-lg mb-3"
            style={{ background: "linear-gradient(135deg, #F25C05, #FF8A3D)", color: "#111" }}
          >
            S
          </div>
          <h1 className="font-display text-2xl font-extrabold text-white">Company Registration</h1>
          <p className="text-sm text-white/50 mt-1">
            {user.account_type.charAt(0).toUpperCase() + user.account_type.slice(1)} account ·{" "}
            {user.full_name}
          </p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {steps.map((label, i) => (
            <div
              key={label}
              className={`flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                i === step
                  ? "bg-[#F25C05]/20 border-[#F25C05]/50 text-[#FF8A3D]"
                  : i < step
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-white/10 text-white/40"
              }`}
            >
              {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              {label}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Choose company type</h2>
              <button
                type="button"
                onClick={() => selectMode("pvt_ltd")}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  mode === "pvt_ltd"
                    ? "border-[#F25C05]/60 bg-[#F25C05]/10"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex items-center gap-3 text-white font-semibold">
                  <Building2 className="h-5 w-5 text-[#F25C05]" />
                  PVT LTD
                </div>
                <p className="mt-1 text-xs text-white/45 pl-8">
                  Total capital, shareholders, Niyamawali & Prabandhapatra (drafted from templates)
                </p>
              </button>
              <button
                type="button"
                onClick={() => selectMode("non_pvt_ltd")}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  mode === "non_pvt_ltd"
                    ? "border-[#F25C05]/60 bg-[#F25C05]/10"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex items-center gap-3 text-white font-semibold">
                  <FileText className="h-5 w-5 text-[#F25C05]" />
                  NON PVT LTD
                </div>
                <p className="mt-1 text-xs text-white/45 pl-8">
                  Name, PAN Number, and MD (Managing Director) — no shareholders
                </p>
              </button>
            </div>
          )}

          {step === 1 && mode === "pvt_ltd" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Company details</h2>
              <label className="block text-xs text-white/60">Company name</label>
              <input
                className={inputClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Legal company name"
              />
              <label className="block text-xs text-white/60">Total Capital (NPR)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={totalCapital}
                onChange={(e) => setTotalCapital(e.target.value)}
                placeholder="0"
              />
              <label className="block text-xs text-white/60">Address</label>
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Registered address"
              />
            </div>
          )}

          {step === 1 && mode === "non_pvt_ltd" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Company details</h2>
              <label className="block text-xs text-white/60">Name</label>
              <input
                className={inputClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company / organization name"
              />
              <label className="block text-xs text-white/60">PAN Number</label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="e.g. 601234567"
                />
                <button
                  type="button"
                  onClick={() => void lookupPan()}
                  className="h-11 px-4 rounded-xl text-sm font-semibold shrink-0"
                  style={{ background: "#F25C05", color: "#111" }}
                >
                  Lookup
                </button>
              </div>
              {lookupMsg && <p className="text-xs text-[#FF8A3D]">{lookupMsg}</p>}
              <label className="block text-xs text-white/60">MD (Managing Director)</label>
              <input
                className={inputClass}
                value={mdName}
                onChange={(e) => setMdName(e.target.value)}
                placeholder="Managing Director full name"
              />
            </div>
          )}

          {step === 2 && mode === "pvt_ltd" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#F25C05]" /> Shareholders
                </h2>
                <button
                  type="button"
                  onClick={() => setShareholders((s) => [...s, emptyShareholder()])}
                  className="text-xs text-[#FF8A3D] flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {shareholders.map((sh) => (
                <div key={sh.key} className="p-4 rounded-xl border border-white/10 space-y-3">
                  <div className="flex justify-between gap-2">
                    <input
                      className={inputClass}
                      placeholder="Shareholder name (User)"
                      value={sh.full_name}
                      onChange={(e) => updateShareholder(sh.key, { full_name: e.target.value })}
                    />
                    {shareholders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShareholders((rows) => rows.filter((r) => r.key !== sh.key))}
                        className="text-white/40 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-white/45">Share Units</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={sh.share_units}
                        onChange={(e) =>
                          updateShareholder(sh.key, { share_units: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/45">Percentage</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={sh.percentage}
                        onChange={(e) =>
                          updateShareholder(sh.key, { percentage: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={sh.is_default}
                      onChange={(e) => updateShareholder(sh.key, { is_default: e.target.checked })}
                    />
                    Default shareholder
                  </label>
                  <p className="text-[11px] text-white/35">
                    Citizenship document can be uploaded after registration from Governance.
                  </p>
                </div>
              ))}
            </div>
          )}

          {step === reviewStep && (
            <div className="space-y-3 text-sm text-white/80">
              <h2 className="text-lg font-semibold text-white">Review</h2>
              <Row label="Type" value={mode === "pvt_ltd" ? "PVT LTD" : "NON PVT LTD"} />
              <Row label="Name" value={companyName || "—"} />
              {mode === "non_pvt_ltd" && (
                <>
                  <Row label="PAN Number" value={pan || "—"} />
                  <Row label="MD (Managing Director)" value={mdName || "—"} />
                </>
              )}
              {mode === "pvt_ltd" && (
                <>
                  <Row label="Total capital" value={totalCapital ? `NPR ${totalCapital}` : "—"} />
                  <Row label="Shareholders" value={`${shareholders.length}`} />
                  <Row
                    label="Leadership"
                    value="CEO/MD → CFO, CMO, COO, CTO + HR department (auto-provisioned)"
                  />
                  <Row label="Governance docs" value="Niyamawali + Prabandhapatra drafts" />
                </>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="h-10 px-4 rounded-xl text-sm text-white/70 border border-white/10 disabled:opacity-30 flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (!validateBeforeContinue()) return;
                  setStep((s) => s + 1);
                }}
                className="h-10 px-5 rounded-xl text-sm font-semibold flex items-center gap-1"
                style={{ background: "linear-gradient(135deg, #F25C05, #FF6F1F)", color: "#111" }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="h-10 px-5 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #F25C05, #FF6F1F)", color: "#111" }}
              >
                {submitting ? "Submitting…" : "Submit registration"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          <Link to="/login" className="hover:text-white/70 underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2">
      <span className="text-white/45">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
