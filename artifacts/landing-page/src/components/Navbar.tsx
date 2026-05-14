import { useI18n } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Languages, UserCircle, LogIn, GraduationCap, Bell, CheckCheck, Megaphone } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchStorefront } from "@/lib/api";

// ── helper: authenticated fetch ────────────────────────────────────────────
function fetchWithAuth(url: string) {
  const token  = localStorage.getItem("auth_token");
  const tenant = localStorage.getItem("tenant_slug");
  const sep    = url.includes("?") ? "&" : "?";
  return fetch(`${url}${tenant ? `${sep}tenant=${tenant}` : ""}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  }).then((r) => r.json());
}

// ── NotificationBell ────────────────────────────────────────────────────────
function NotificationBell({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const qc              = useQueryClient();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["notif-count"],
    queryFn: () => fetchWithAuth("/api/storefront/notifications/unread-count"),
    refetchInterval: 15_000,
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["notifications"],
    queryFn:  () => fetchWithAuth("/api/storefront/notifications"),
    enabled:  open,
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      fetchWithAuth(`/api/storefront/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => fetch("/api/storefront/notifications/read-all", {
      method: "PATCH",
      headers: {
        ...(localStorage.getItem("auth_token") ? { Authorization: `Bearer ${localStorage.getItem("auth_token")}` } : {}),
        ...(localStorage.getItem("tenant_slug") ? {} : {}),
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // إغلاق لو ضغط برّا
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = countData?.count ?? 0;

  const typeIcon: Record<string, string> = {
    payment_approved: "✅",
    payment_rejected: "❌",
    course_activated: "🎓",
    new_message:      "💬",
    quiz_graded:      "📝",
    certificate_ready:"🏆",
    general:          "📢",
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="rounded-full relative"
        onClick={() => setOpen((v) => !v)} title={lang === "ar" ? "الإشعارات" : "Notifications"}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className={cn(
          "absolute top-12 z-50 w-80 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden",
          lang === "ar" ? "left-0" : "right-0"
        )}>
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-primary" />
              {lang === "ar" ? "الإشعارات" : "Notifications"}
              {unread > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{unread}</span>}
            </span>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                <CheckCheck className="w-3.5 h-3.5" />
                {lang === "ar" ? "قراءة الكل" : "Mark all read"}
              </button>
            )}
          </div>

          {/* list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>{lang === "ar" ? "لا توجد إشعارات" : "No notifications yet"}</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <button key={n.id} onClick={() => !n.isRead && markRead.mutate(n.id)}
                  className={cn(
                    "w-full text-start px-4 py-3 hover:bg-muted/60 transition-colors",
                    !n.isRead && "bg-primary/5"
                  )}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5 shrink-0">{typeIcon[n.type] ?? "📢"}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm truncate", !n.isRead && "font-semibold")}>
                        {lang === "ar" ? (n.titleAr || n.title) : n.title}
                      </p>
                      {(lang === "ar" ? (n.bodyAr || n.body) : n.body) && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {lang === "ar" ? (n.bodyAr || n.body) : n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {new Date(n.createdAt).toLocaleDateString(
                          lang === "ar" ? "ar-EG" : "en-US",
                          { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                        )}
                      </p>
                    </div>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [location, navigate] = useLocation();

  // ✅ هل احنا على الصفحة الرئيسية؟
  const isHome = location === "/" || location === "";

  const { data: settings } = useQuery<any>({
    queryKey: ["/api/storefront/settings"],
    queryFn: () => fetchStorefront("/api/storefront/settings"),
    staleTime: 60_000,
  });

  const academyName = lang === "ar" 
  ? (settings?.academyNameAr || settings?.academyName || "EduAcademy Pro")
  : (settings?.academyName || "EduAcademy Pro");
  const logoUrl = settings?.logoUrl;

  // ✅ رابط الصفحة الرئيسية مع الـ tenant
  const homeUrl = () => {
    const tenant = localStorage.getItem("tenant_slug");
    return tenant ? `/?tenant=${tenant}` : "/";
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate(homeUrl());
  };

  const handleLogoClick = () => {
    navigate(homeUrl());
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
        scrolled
          ? "bg-background/80 backdrop-blur-md border-border shadow-sm py-3"
          : "bg-transparent border-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">

        {/* ✅ اللوجو + اسم الأكاديمية */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleLogoClick}>
          {logoUrl ? (
            <img src={logoUrl} alt={academyName} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <span className="font-bold text-xl hidden sm:inline-block">{academyName}</span>
        </div>

        {/* ✅ الـ nav links بتظهر بس في الصفحة الرئيسية */}
        {isHome && (
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">{t("nav.features")}</a>
            <a href="#courses" className="text-sm font-medium hover:text-primary transition-colors">{t("nav.courses")}</a>
            <a href="#testimonials" className="text-sm font-medium hover:text-primary transition-colors">{t("nav.testimonials")}</a>
          </nav>
        )}

        {/* الجانب الأيمن */}
        <div className="flex items-center gap-2">
          {/* ✅ زرار اللغة */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="rounded-full"
            title="Toggle Language"
          >
            <Languages className="h-5 w-5" />
          </Button>

          {/* ✅ زرار الثيم */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-full"
            title="Toggle Theme"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <div className="h-6 w-[1px] bg-border mx-1 hidden sm:block" />

          {/* 🔔 Bell — بس للطالب المسجّل */}
          {isAuthenticated && user && (
            <NotificationBell lang={lang} />
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="gap-2 hidden sm:flex"
                onClick={() => navigate("/portal")}
              >
                <UserCircle className="w-5 h-5" />
                <span className="max-w-28 truncate">{user.name}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                {lang === "ar" ? "خروج" : "Logout"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const tenant = localStorage.getItem("tenant_slug");
                  navigate(tenant ? `/login?tenant=${tenant}` : "/login");
                }}
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden xs:inline">{lang === "ar" ? "دخول" : "Login"}</span>
              </Button>

              <Button
                size="sm"
                className="rounded-full px-5"
                onClick={() => {
                  const tenant = localStorage.getItem("tenant_slug");
                  navigate(tenant ? `/register?tenant=${tenant}` : "/register");
                }}
              >
                {lang === "ar" ? "ابدأ الآن" : "Join Now"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}