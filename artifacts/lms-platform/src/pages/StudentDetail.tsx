import { useParams, useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetStudent, getGetStudentQueryKey } from "@workspace/api-client-react";
import { ChevronLeft, Mail, Phone, BookOpen, CreditCard, CheckCircle2, Circle, BarChart3, Trophy, XCircle, UserCheck, UserX, Bell, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";

const paymentBadge: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  refunded: "bg-muted text-muted-foreground",
};

function fetchWithAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("lms_admin_token");
  const tenant = localStorage.getItem("tenant_slug");
  const sep = url.includes("?") ? "&" : "?";
  return fetch(`${url}${tenant ? `${sep}tenant=${tenant}` : ""}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const studentId = parseInt(id!);

  const { data: student, isLoading } = useGetStudent(studentId, {
    query: { queryKey: getGetStudentQueryKey(studentId) },
  });

  const { data: progressDetail, isLoading: progressLoading } = useQuery<any>({
    queryKey: ["student-progress-detail", studentId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/students/${studentId}/progress-detail`);
      if (!res.ok) throw new Error("Failed to fetch progress detail");
      return res.json();
    },
    enabled: !!studentId,
  });

  // ✅ mutation لتغيير الحالة
  const statusMutation = useMutation({
  mutationFn: async (newStatus: string) => {
    const token = localStorage.getItem("lms_admin_token");
    const tenant = localStorage.getItem("tenant_slug");
    const res = await fetch(`/api/students/${studentId}${tenant ? `?tenant=${tenant}` : ""}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: student!.name,
        email: student!.email,
        phone: student!.phone ?? undefined,
        courseId: (student as any).courseId ?? undefined,
        status: newStatus,
        paymentStatus: student!.paymentStatus,
      }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    return res.json();
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
    qc.invalidateQueries({ queryKey: ["/api/students"] });
    toast.success("تم تغيير حالة الطالب");
  },
  onError: () => toast.error("فشل تغيير الحالة"),
});

  const handleNavigateBack = () => {
    const tenant = localStorage.getItem("tenant_slug");
    navigate(tenant ? `/students?tenant=${tenant}` : "/students");
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-card border border-card-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!student) return <div className="text-center py-16 text-muted-foreground">Student not found</div>;

  const isActive = student.status === "active";

  const [notifyOpen, setNotifyOpen]   = useState(false);
  const [notifTitle, setNotifTitle]   = useState("");
  const [notifBody,  setNotifBody]    = useState("");
  const [notifType,  setNotifType]    = useState("general");

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const tenant = localStorage.getItem("tenant_slug");
      const token  = localStorage.getItem("admin_token");
      const res = await fetch(
        `/api/students/${studentId}/notify${tenant ? `?tenant=${tenant}` : ""}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ type: notifType, title: notifTitle, body: notifBody }),
        }
      );
      if (!res.ok) throw new Error("Failed to send");
    },
    onSuccess: () => {
      toast.success("Notification sent!");
      setNotifyOpen(false);
      setNotifTitle(""); setNotifBody("");
    },
    onError: () => toast.error("Failed to send notification"),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={handleNavigateBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{student.name}</h1>
        <button
          onClick={() => setNotifyOpen(true)}
          className="ms-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title="Send Notification"
        >
          <Bell className="w-3.5 h-3.5" />
          Send Notification
        </button>
      </div>

      {/* ── Notification Modal ── */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Send Notification</h2>
              <button onClick={() => setNotifyOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
                <select value={notifType} onChange={(e) => setNotifType(e.target.value)}
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none border border-transparent focus:border-primary">
                  <option value="general">📢 General</option>
                  <option value="payment_approved">✅ Payment Approved</option>
                  <option value="payment_rejected">❌ Payment Rejected</option>
                  <option value="course_activated">🎓 Course Activated</option>
                  <option value="quiz_graded">📝 Quiz Graded</option>
                  <option value="certificate_ready">🏆 Certificate Ready</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-destructive">*</span></label>
                <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none border border-transparent focus:border-primary" />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Message</label>
                <textarea value={notifBody} onChange={(e) => setNotifBody(e.target.value)}
                  rows={3} placeholder="Optional message body..."
                  className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none border border-transparent focus:border-primary resize-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setNotifyOpen(false)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={() => notifyMutation.mutate()}
                disabled={!notifTitle.trim() || notifyMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {notifyMutation.isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
            {student.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="font-semibold text-lg">{student.name}</h2>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{student.email}</span>
              {student.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{student.phone}</span>}
              {(student as any).courseName && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{(student as any).courseName}</span>}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <div className="w-32 bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${student.progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{student.progress}% complete</span>
            </div>
          </div>

          {/* ✅ زرار تغيير الحالة */}
          <div className="flex flex-col items-end gap-2">
            <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full",
              student.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
              student.paymentStatus === "overdue" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
              "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {t(student.paymentStatus)}
            </span>
            <button
              onClick={() => statusMutation.mutate(isActive ? "inactive" : "active")}
              disabled={statusMutation.isPending}
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors",
                isActive
                  ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}
            >
              {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              {isActive ? "Suspend" : "Activate"}
            </button>
            {/* <span className="text-xs text-muted-foreground">
              Enrolled {new Date((student as any).enrolledAt ?? student.createdAt).toLocaleDateString()}
            </span> */}
          </div>
        </div>
      </div>

      {/* Lesson Progress */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Lesson Progress</h2>
          {progressDetail?.enrolled && (
            <span className="ms-auto text-xs text-muted-foreground">
              {progressDetail.completedLessons} / {progressDetail.totalLessons} lessons completed
            </span>
          )}
        </div>
        {progressLoading && (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
          </div>
        )}
        {!progressLoading && (!progressDetail || !progressDetail.enrolled) && (
          <div className="text-center py-10 text-muted-foreground text-sm">Not enrolled in any course</div>
        )}
        {!progressLoading && progressDetail?.enrolled && (
          <div className="divide-y divide-border">
            {(progressDetail.modules ?? []).map((mod: any) => (
              <div key={mod.id} className="px-5 py-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {mod.titleAr || mod.title}
                </p>
                <div className="space-y-1">
                  {(mod.lessons ?? []).map((lesson: any) => (
                    <div key={lesson.id} className="flex items-center gap-3 py-1">
                      {lesson.completed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                      <span className="text-sm flex-1 truncate">{lesson.titleAr || lesson.title}</span>
                      {lesson.quizAttempt && (
                        <div className={cn(
                          "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                          lesson.quizAttempt.passed
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        )}>
                          {lesson.quizAttempt.passed ? <Trophy className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          Quiz: {lesson.quizAttempt.score}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Payment History ({(student as any).payments?.length ?? 0})</h2>
        </div>
        {((student as any).payments?.length ?? 0) === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No payments recorded</div>
        ) : (
          <div className="divide-y divide-border">
            {((student as any).payments ?? []).map((p: any) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">${Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground capitalize">{t(p.method)} · {new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", paymentBadge[p.status])}>
                  {t(p.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}