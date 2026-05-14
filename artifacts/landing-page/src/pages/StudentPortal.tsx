import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  User, BookOpen, CreditCard, LogOut, PlayCircle, FileText, Lock,
  Clock, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight,
  Calendar, Video, ExternalLink, GraduationCap, TrendingUp, Radio,
  Loader2, CheckCheck, MessageCircle, Send, ClipboardList, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

type Tab = "overview" | "lessons" | "payments" | "messages" | "my-courses" | "certificates";

const statusColors: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  refunded: "bg-muted text-muted-foreground",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const methodLabel: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Vodafone Cash / Cash",
  card: "Card",
  online: "Online",
};

// ✅ fetch helper بيبعت student token و tenant
function fetchWithStudentAuth(url: string, options?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const tenant = localStorage.getItem("tenant_slug");
  const sep = url.includes("?") ? "&" : "?";
  return fetch(`${url}${tenant ? `${sep}tenant=${tenant}` : ""}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  }).then((r) => r.json());
}

function PaymentStatusBanner({ paymentStatus, status }: { paymentStatus: string; status: string }) {
  const { lang } = useI18n();
  if (status === "active") return null;

  if (paymentStatus === "pending" || status === "pending") {
    return (
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm">
            {lang === "ar" ? "طلبك قيد المراجعة" : "Your payment is under review"}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
            {lang === "ar"
              ? "سيتم تفعيل الكورس خلال 24 ساعة بعد التحقق من التحويل."
              : "Your course will be activated within 24 hours once payment is verified."}
          </p>
        </div>
      </div>
    );
  }

  if (paymentStatus === "overdue") {
    return (
      <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-700 dark:text-red-400 text-sm">
            {lang === "ar" ? "تم رفض الدفعة" : "Payment was rejected"}
          </p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
            {lang === "ar"
              ? "يرجى التواصل مع الدعم أو إعادة المحاولة."
              : "Please contact support or try enrolling again."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function QuizWidget({ lessonId, studentId }: { lessonId: number; studentId: number }) {
  const { lang } = useI18n();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; correctAnswers: number; totalQuestions: number; passingScore: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const quizFetch = (url: string, options?: RequestInit) => {
    const token  = localStorage.getItem("auth_token");
    const tenant = localStorage.getItem("tenant_slug");
    const sep    = url.includes("?") ? "&" : "?";
    return fetch(`${url}${tenant ? `${sep}tenant=${tenant}` : ""}`, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const { data: quiz, isLoading } = useQuery<any>({
    queryKey: ["quiz", "lesson", lessonId],
    queryFn: async () => {
      const res = await quizFetch(`/api/quizzes/lesson/${lessonId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch quiz");
      return res.json();
    },
    retry: false,
  });

  const { data: attempt } = useQuery<any>({
    queryKey: ["quiz-attempt", quiz?.id, studentId],
    queryFn: async () => {
      if (!quiz?.id) return null;
      const res = await quizFetch(`/api/quizzes/${quiz.id}/attempts/${studentId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!quiz?.id,
  });

  if (isLoading) return null;
  if (!quiz) return null;

  const displayResult = result ?? (attempt ? {
    score: attempt.score,
    passed: attempt.passed,
    correctAnswers: 0,
    totalQuestions: quiz.questions.length,
    passingScore: quiz.passingScore,
  } : null);

  const handleSubmit = async () => {
    if (!quiz) return;
    const answersArr = quiz.questions.map((_: any, i: number) => answers[i] ?? -1);
    setSubmitting(true);
    try {
      const res = await quizFetch(`/api/quizzes/${quiz.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, answers: answersArr }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      const data = await res.json();
      setResult(data);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 border border-primary/20 rounded-xl p-4 bg-primary/5 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{quiz.title}</span>
        <span className="text-xs text-muted-foreground ms-auto">{lang === "ar" ? "درجة النجاح:" : "Pass:"} {quiz.passingScore}%</span>
      </div>

      {displayResult ? (
        <div className={cn(
          "rounded-xl p-4 text-center space-y-1",
          displayResult.passed
            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
        )}>
          {displayResult.passed ? <Trophy className="w-6 h-6 mx-auto" /> : <XCircle className="w-6 h-6 mx-auto" />}
          <p className="font-bold text-lg">{displayResult.score}%</p>
          <p className="text-sm">{displayResult.passed
            ? (lang === "ar" ? "اجتزت الاختبار!" : "Quiz Passed!")
            : (lang === "ar" ? "لم تجتز. حاول مرة أخرى" : "Not passed. Try again")}</p>
          {!displayResult.passed && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { setResult(null); setAnswers({}); }}>
              {lang === "ar" ? "إعادة المحاولة" : "Retry"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {quiz.questions.map((q: any, qi: number) => (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">{qi + 1}. {q.questionText}</p>
              <div className="grid gap-1.5">
                {q.options.map((opt: string, oi: number) => (
                  <button key={oi}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qi]: oi }))}
                    className={cn(
                      "text-start text-sm px-3 py-2 rounded-lg border transition-colors",
                      answers[qi] === oi
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                    )}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Button size="sm" className="w-full"
            disabled={submitting || Object.keys(answers).length < quiz.questions.length}
            onClick={handleSubmit}>
            {submitting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : (lang === "ar" ? "تسليم الإجابات" : "Submit Answers")}
          </Button>
        </div>
      )}
    </div>
  );
}

function LessonItem({
  lesson, index, isUnlocked, lang, studentId,
  onPlay, completedIds, onComplete,
}: {
  lesson: any; index: number; isUnlocked: boolean; lang: string;
  studentId: number;
  onPlay: (url: string, title: string) => void;
  completedIds: Set<number>;
  onComplete: (lessonId: number) => void;
}) {
  const title = lang === "ar" ? (lesson.titleAr || lesson.title) : lesson.title;
  const isVideo = lesson.type === "video" && lesson.videoUrl;
  const canClick = isUnlocked && isVideo;
  const isDone = completedIds.has(lesson.id);
  const [marking, setMarking] = useState(false);

  const markComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDone || marking) return;
    setMarking(true);
    try {
      const token  = localStorage.getItem("auth_token");
      const tenant = localStorage.getItem("tenant_slug");
      await fetch(`/api/lessons/${lesson.id}/complete${tenant ? `?tenant=${tenant}` : ""}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ studentId }),
      });
      onComplete(lesson.id);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => canClick && onPlay(lesson.videoUrl, title)}
        className={cn(
          "flex items-center gap-3 px-5 py-3.5 text-sm transition-colors",
          canClick ? "cursor-pointer hover:bg-accent/30" : "opacity-60"
        )}
      >
        <span className="text-muted-foreground w-5 shrink-0 text-xs">{index + 1}.</span>
        {lesson.type === "video"
          ? <PlayCircle className="w-4 h-4 text-primary shrink-0" />
          : <FileText className="w-4 h-4 text-amber-500 shrink-0" />}
        <span className="flex-1">{title}</span>
        {lesson.duration && (
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {Math.floor(lesson.duration / 60) > 0
              ? `${Math.floor(lesson.duration / 60)}h ${lesson.duration % 60}m`
              : `${lesson.duration}m`}
          </span>
        )}
        {isUnlocked && (
          <button onClick={markComplete} disabled={marking || isDone}
            title={isDone ? (lang === "ar" ? "مكتمل" : "Completed") : (lang === "ar" ? "تحديد كمكتمل" : "Mark complete")}
            className={cn(
              "shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors",
              isDone
                ? "bg-emerald-500 text-white"
                : "border border-border hover:border-emerald-400 hover:text-emerald-500 text-muted-foreground"
            )}>
            {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
          </button>
        )}
        {!isUnlocked && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </div>
    </div>
  );
}

// ── تايب الرسالة الجاية من الـ API ──────────────────────────────────────────
type ApiMessage = {
  id: number;
  senderType: "instructor" | "student";
  senderId: number;
  senderName: string;
  content: string | null;
  createdAt: string;
  attachments: { id: number; filename: string; storedFilename: string; mimeType: string; size: number }[];
};

function MessagesTab({
  studentId,
  studentName,
  enrollments,
  lang,
}: {
  studentId: number;
  studentName: string;
  enrollments: any[] | undefined;
  lang: string;
}) {
  // الكورس المختار للمحادثة
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // تحديث الكورس الافتراضي لما تتحمل الـ enrollments
  useEffect(() => {
    if (!selectedCourseId && enrollments && enrollments.length > 0) {
      setSelectedCourseId(enrollments[0].courseId ?? null);
    }
  }, [enrollments]);

  const courseId = selectedCourseId;

  const [messages, setMessages]   = useState<ApiMessage[]>([]);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const lastIdRef                 = useRef<number>(0);
  const bottomRef                 = useRef<HTMLDivElement>(null);

  // reset الرسائل لما يغير الكورس
  useEffect(() => {
    setMessages([]);
    lastIdRef.current = 0;
    setLoading(true);
    setError(null);
  }, [courseId]);

  // ── رابط الـ API (private chat طالب ↔ مدرب) ──────────────────────────
  const baseUrl = courseId
    ? `/api/instructors/chat/${courseId}/private/${studentId}`
    : null;

  // ── جلب الرسائل (أولي + polling) ─────────────────────────────────────
  const fetchMessages = async (initial = false) => {
    if (!baseUrl) return;
    try {
      const url = initial || lastIdRef.current === 0
        ? baseUrl
        : `${baseUrl}?since=${encodeURIComponent(
            messages[messages.length - 1]?.createdAt ?? ""
          )}`;
      const token  = localStorage.getItem("auth_token");
      const tenant = localStorage.getItem("tenant_slug");
      const sep    = url.includes("?") ? "&" : "?";
      const res    = await fetch(`${url}${tenant ? `${sep}tenant=${tenant}` : ""}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error("fetch failed");
      const data: ApiMessage[] = await res.json();
      if (initial) {
        setMessages(data);
        if (data.length) lastIdRef.current = data[data.length - 1]!.id;
        setLoading(false);
      } else if (data.length) {
        setMessages((prev) => {
          // تجنب التكرار بناءً على الـ id
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.filter((m) => !existingIds.has(m.id));
          return newMsgs.length ? [...prev, ...newMsgs] : prev;
        });
        lastIdRef.current = data[data.length - 1]!.id;
      }
    } catch {
      if (initial) {
        setError(lang === "ar" ? "تعذّر تحميل الرسائل" : "Failed to load messages");
        setLoading(false);
      }
    }
  };

  // جلب أولي
  useEffect(() => {
    if (!baseUrl) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setMessages([]);
    lastIdRef.current = 0;
    fetchMessages(true);
  }, [baseUrl]);

  // Polling كل 5 ثواني
  useEffect(() => {
    if (!baseUrl) return;
    const id = setInterval(() => fetchMessages(false), 5000);
    return () => clearInterval(id);
  }, [baseUrl, messages]);

  // scroll للأسفل عند وصول رسائل جديدة
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── إرسال رسالة ──────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || !courseId) return;
    setSending(true);
    try {
      const token  = localStorage.getItem("auth_token");
      const tenant = localStorage.getItem("tenant_slug");
      const formData = new FormData();
      formData.append("senderType", "student");
      formData.append("senderId", String(studentId));
      formData.append("senderName", studentName);
      formData.append("content", text);
      formData.append("recipientStudentId", String(studentId));
      const res = await fetch(
        `/api/instructors/chat/${courseId}${tenant ? `?tenant=${tenant}` : ""}`,
        {
          method: "POST",
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: formData,
        }
      );
      if (!res.ok) throw new Error();
      const msg: ApiMessage = await res.json();
      setMessages((prev) => [...prev, msg]);
      lastIdRef.current = msg.id;
      setInput("");
    } catch {
      // يظهر toast لو حاب تضيف
    } finally {
      setSending(false);
    }
  };

  // ── مساعدة: هل الرسالة من الطالب الحالي؟ ────────────────────────────
  const isOwn = (msg: ApiMessage) =>
    msg.senderType === "student" && msg.senderId === studentId;

  // ── لو مفيش courseId ──────────────────────────────────────────────────
  if (!courseId) {
    return (
      <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
        <MessageCircle className="w-10 h-10 mb-3 opacity-30" />
        <p>{lang === "ar" ? "يجب التسجيل في كورس أولاً" : "Enroll in a course first"}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
      {/* Course selector - يظهر بس لو في أكتر من كورس */}
      {enrollments && enrollments.length > 1 && (
        <div className="px-4 pt-4 pb-2">
          <select
            value={courseId ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setSelectedCourseId(isNaN(val) ? null : val);
            }}
            className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            dir={lang === "ar" ? "rtl" : "ltr"}
          >
            {enrollments.map((enr: any) => (
              <option key={enr.courseId} value={enr.courseId}>
                {enr.courseTitle || enr.courseTitleAr || (lang === "ar" ? `كورس #${enr.courseId}` : `Course #${enr.courseId}`)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">
          {lang === "ar" ? "رسائل المدرب" : "Instructor Messages"}
        </span>
        {/* نقطة خضراء تدل على الـ polling */}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {lang === "ar" ? "مباشر" : "Live"}
        </span>
      </div>

      {/* جسم الرسائل */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 380 }}>
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && error && (
          <div className="text-center py-10 text-destructive text-sm">{error}</div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{lang === "ar" ? "ابدأ محادثة مع مدربك" : "Start a conversation with your instructor"}</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", isOwn(msg) ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-xs rounded-2xl px-4 py-2.5 text-sm",
              isOwn(msg)
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            )}>
              {!isOwn(msg) && (
                <p className="text-[10px] font-medium mb-1 opacity-70">{msg.senderName} 👨‍🏫</p>
              )}
              {msg.content && <p>{msg.content}</p>}
              {msg.attachments?.map((att) => (
                <a
                  key={att.id}
                  href={`/api/instructors/attachments/${att.storedFilename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 mt-1 text-xs underline opacity-80"
                >
                  📎 {att.filename}
                </a>
              ))}
              <p className="text-[10px] opacity-60 mt-1">
                {new Date(msg.createdAt).toLocaleTimeString(
                  lang === "ar" ? "ar-EG" : "en-US",
                  { hour: "2-digit", minute: "2-digit" }
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input الإرسال */}
      <div className="border-t border-border p-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={lang === "ar" ? "اكتب رسالتك..." : "Type a message..."}
          className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 border border-transparent"
          dir={lang === "ar" ? "rtl" : "ltr"}
          disabled={sending}
        />
        <Button size="sm" onClick={send} disabled={!input.trim() || sending} className="gap-1.5 px-4">
          {sending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />
          }
        </Button>
      </div>
    </div>
  );
}

export default function StudentPortal() {
  const { t, lang } = useI18n();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [openModules, setOpenModules] = useState<Record<number, boolean>>({});
  const [activeVideo, setActiveVideo] = useState<{ url: string; title: string } | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  // الكورس المختار في الـ lessons tab
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // ✅ student data من الـ auth/me
  const { data: student, isLoading: studentLoading, refetch: refetchStudent } = useQuery({
    queryKey: ["student-portal", user?.id],
    queryFn: () => fetchWithStudentAuth(`/api/auth/me`),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  // ✅ enrollments — كل الكورسات اللي الطالب مشترك فيها
  const { data: enrollments } = useQuery<any[]>({
    queryKey: [`/api/enrollments?studentId=${user?.id}`],
    queryFn: () => fetchWithStudentAuth(`/api/enrollments?studentId=${user!.id}`),
    enabled: !!user?.id,
  });

  // activeCourseId = المختار أو أول كورس في الـ enrollments كـ fallback
  const activeCourseId = selectedCourseId
    ?? (enrollments && enrollments.length > 0 ? enrollments[0].courseId : null)
    ?? user?.courseId
    ?? null;

  // ✅ course data للكورس المختار
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["student-course", activeCourseId],
    queryFn: () => fetchWithStudentAuth(`/api/storefront/courses/${activeCourseId}`),
    enabled: !!activeCourseId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const isActive = student?.status === "active";
  const isLive = course?.courseType === "live";

  const totalLessons = course?.modules?.reduce(
    (acc: number, m: any) => acc + (m.lessons?.length ?? 0), 0
  ) ?? 0;

  const toggleModule = (id: number) =>
    setOpenModules((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleLogout = () => {
    logout();
    const tenant = localStorage.getItem("tenant_slug");
    navigate(tenant ? `/?tenant=${tenant}` : "/");
  };

  const handleLessonComplete = (lessonId: number) => {
    setCompletedIds((prev) => new Set([...prev, lessonId]));
    setTimeout(() => refetchStudent(), 500);
  };

  // ✅ certificates
  const { data: myCerts } = useQuery<any[]>({
    queryKey: [`/api/certificates/student/${user?.id}`],
    queryFn: () => fetchWithStudentAuth(`/api/certificates/student/${user!.id}`),
    enabled: !!user?.id,
  });

  // ✅ مدفوعات الطالب من endpoint مستقل محمي بـ JWT
  const { data: payments = [], isLoading: paymentsLoading } = useQuery<any[]>({
    queryKey: ["my-payments", user?.id],
    queryFn: () => fetchWithStudentAuth(`/api/storefront/my-payments`),
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      const tenant = localStorage.getItem("tenant_slug");
      navigate(tenant ? `/login?tenant=${tenant}` : "/login");
    }
  }, [authLoading, user, navigate]);

  // لا نستخدم early return هنا عشان ما نكسرش Rules of Hooks
  // بدله بنرجع loading UI كجزء من الـ render العادي
  const isReady = !authLoading && !!user;

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: "overview",      label: lang === "ar" ? "نظرة عامة" : "Overview",     icon: User },
    { key: "lessons",       label: lang === "ar" ? "الدروس" : "Lessons",         icon: BookOpen },
    { key: "my-courses",    label: lang === "ar" ? "كورساتي" : "My Courses",      icon: GraduationCap },
    { key: "certificates",  label: lang === "ar" ? "شهاداتي" : "Certificates",   icon: Trophy },
    { key: "payments",      label: lang === "ar" ? "المدفوعات" : "Payments",     icon: CreditCard },
    { key: "messages",      label: lang === "ar" ? "الرسائل" : "Messages",       icon: MessageCircle },
  ];

  const courseTitle = lang === "ar"
    ? (course?.titleAr || course?.title || "")
    : (course?.title || "");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <motion.div
            className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-border rounded-2xl p-6"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
                  {user.name[0].toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold">{lang === "ar" ? `مرحباً، ${user.name}` : `Welcome, ${user.name}`}</h1>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn(
                      "text-[10px] font-semibold px-2.5 py-0.5 rounded-full",
                      isActive
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}>
                      {isActive ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "قيد الانتظار" : "Pending")}
                    </span>
                    {course && (
                      <span className="text-xs text-muted-foreground truncate max-w-48">
                        {enrollments && enrollments.length > 1
                          ? `${enrollments.length} ${lang === "ar" ? "كورسات" : "courses"}`
                          : courseTitle}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground hover:text-foreground shrink-0">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">{lang === "ar" ? "خروج" : "Logout"}</span>
              </Button>
            </div>
          </motion.div>

          {/* Payment Status Banner */}
          {student && (
            <PaymentStatusBanner paymentStatus={student.paymentStatus} status={student.status} />
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-w-fit px-3",
                  activeTab === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ─── OVERVIEW ─── */}
            {activeTab === "overview" && (
              <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: lang === "ar" ? "التقدم" : "Progress", value: `${student?.progress ?? 0}%`, icon: TrendingUp, color: "bg-primary/10 text-primary" },
                    { label: lang === "ar" ? "الدروس" : "Lessons", value: totalLessons, icon: PlayCircle, color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" },
                    {
                      label: lang === "ar" ? "حالة الدفع" : "Payment",
                      value: student?.paymentStatus === "paid" ? (lang === "ar" ? "مدفوع" : "Paid") : (lang === "ar" ? "معلق" : "Pending"),
                      icon: CreditCard,
                      color: student?.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-bold">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">{lang === "ar" ? "تقدم الكورس" : "Course Progress"}</span>
                    <span className="text-sm font-bold text-primary">{student?.progress ?? 0}%</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }} animate={{ width: `${student?.progress ?? 0}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }} />
                  </div>
                  {course && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {lang === "ar" ? "الكورس المسجّل:" : "Enrolled course:"}{" "}
                      <span className="font-medium text-foreground">{courseTitle}</span>
                    </p>
                  )}
                </div>

                {/* ── كل الكورسات المشترك فيها ── */}
                {enrollments && enrollments.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-muted-foreground px-1">
                      {lang === "ar" ? "كوراتي المسجّلة" : "My Enrolled Courses"} ({enrollments.length})
                    </p>
                    {enrollments.map((enroll: any) => {
                      const ct = lang === "ar" ? (enroll.courseTitleAr || enroll.courseTitle) : enroll.courseTitle;
                      const isSelected = (selectedCourseId ?? enrollments[0]?.courseId) === enroll.courseId;
                      const isEnrollActive = enroll.status === "active";
                      return (
                        <div key={enroll.id}
                          className={cn(
                            "bg-card border rounded-2xl overflow-hidden transition-all",
                            isSelected ? "border-primary ring-1 ring-primary/30" : "border-border"
                          )}>
                          {/* thumbnail */}
                          <div className="h-28 bg-gradient-to-br from-primary/20 to-primary/5 relative flex items-center justify-center">
                            {enroll.thumbnailUrl ? (
                              <img src={enroll.thumbnailUrl} alt={ct} className="w-full h-full object-cover absolute inset-0" />
                            ) : (
                              enroll.courseType === "live"
                                ? <Radio className="w-10 h-10 text-primary/30" />
                                : <GraduationCap className="w-10 h-10 text-primary/30" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                            <div className="absolute bottom-2 start-3 end-3 flex items-center justify-between gap-2">
                              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0",
                                enroll.courseType === "live" ? "bg-red-500" : "bg-primary")}>
                                {enroll.courseType === "live" ? (lang === "ar" ? "مباشر" : "Live") : (lang === "ar" ? "مسجّل" : "Recorded")}
                              </span>
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                                isEnrollActive
                                  ? "bg-emerald-500 text-white"
                                  : "bg-amber-500 text-white")}>
                                {isEnrollActive ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "معلق" : "Pending")}
                              </span>
                            </div>
                          </div>
                          <div className="p-4">
                            <h3 className="font-bold text-sm mb-2 line-clamp-2">{ct}</h3>
                            {/* progress bar */}
                            <div className="mb-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>{lang === "ar" ? "التقدم" : "Progress"}</span>
                                <span className="font-medium text-primary">{enroll.progress ?? 0}%</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${enroll.progress ?? 0}%` }} />
                              </div>
                            </div>
                            <Button className="w-full gap-2 h-9 text-sm"
                              onClick={() => { setSelectedCourseId(enroll.courseId); setActiveTab("lessons"); }}
                              disabled={!isEnrollActive}>
                              <PlayCircle className="w-4 h-4" />
                              {isEnrollActive ? (lang === "ar" ? "ابدأ التعلم" : "Start Learning") : (lang === "ar" ? "في انتظار التفعيل" : "Awaiting Activation")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : courseLoading ? (
                  <div className="h-32 bg-muted animate-pulse rounded-2xl" />
                ) : (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                    <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-medium text-sm">{lang === "ar" ? "لم تسجّل في أي كورس بعد" : "Not enrolled in any course yet"}</p>
                    <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/")}>
                      {lang === "ar" ? "استعرض الكورسات" : "Browse Courses"}
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── LESSONS ─── */}
            {activeTab === "lessons" && (
              <motion.div key="lessons" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

                {/* ── Course Selector (لو أكتر من كورس) ── */}
                {enrollments && enrollments.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {enrollments.map((enroll: any) => {
                      const ct = lang === "ar"
                        ? (enroll.courseTitleAr || enroll.courseTitle)
                        : enroll.courseTitle;
                      const isSelected = activeCourseId === enroll.courseId;
                      return (
                        <button key={enroll.courseId}
                          onClick={() => { setSelectedCourseId(enroll.courseId); setActiveVideo(null); setOpenModules({}); }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-semibold border transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                          )}>
                          {ct}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!course && !courseLoading && (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                    <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{lang === "ar" ? "لم تسجّل في أي كورس بعد" : "No course enrolled yet"}</p>
                  </div>
                )}

                {!isActive && course && (
                  <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                    <Lock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {lang === "ar" ? "سيتم فتح الدروس بعد تأكيد الدفع." : "Lessons will unlock once your payment is confirmed."}
                    </p>
                  </div>
                )}

                {activeVideo && (
                  <motion.div className="bg-black rounded-2xl overflow-hidden aspect-video" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                    <video key={activeVideo.url} src={activeVideo.url} controls autoPlay className="w-full h-full" />
                  </motion.div>
                )}

                {courseLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-2xl" />)}
                  </div>
                )}

                {course && isLive && (
                  <div className="space-y-3">
                    {((course as any).sessions ?? []).length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl">
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{lang === "ar" ? "لا توجد جلسات مجدولة بعد" : "No sessions scheduled yet."}</p>
                      </div>
                    ) : (
                      (course as any).sessions.map((session: any) => {
                        const scheduled = new Date(session.scheduledAt);
                        const isPast = scheduled < new Date();
                        const title = lang === "ar" ? (session.titleAr || session.title) : session.title;
                        return (
                          <div key={session.id} className={cn("bg-card border rounded-2xl p-5 flex items-center gap-4", isPast ? "opacity-60 border-border" : "border-primary/30")}>
                            <div className={cn("w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white font-bold shrink-0", isPast ? "bg-muted text-muted-foreground" : "bg-primary")}>
                              <span className="text-lg leading-none">{scheduled.getDate()}</span>
                              <span className="text-[10px] uppercase">{scheduled.toLocaleString("default", { month: "short" })}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {scheduled.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                                <span>·</span>
                                <Video className="w-3 h-3" />
                                {session.durationMinutes}m
                              </p>
                            </div>
                            {session.zoomLink && !isPast && isActive && (
                              <Button size="sm" className="gap-1.5 bg-[#2D8CFF] hover:bg-[#1a7ae0] text-white shrink-0"
                                onClick={() => window.open(session.zoomLink, "_blank")}>
                                <ExternalLink className="w-3.5 h-3.5" />
                                Zoom
                              </Button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {course && !isLive && (
                  <div className="space-y-3">
                    {(course.modules ?? []).length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl">
                        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{lang === "ar" ? "محتوى الكورس قريباً" : "Course content coming soon."}</p>
                      </div>
                    ) : (
                      (course.modules ?? []).map((module: any, idx: number) => {
                        const isOpen = openModules[module.id] ?? idx === 0;
                        const moduleTitle = lang === "ar" ? (module.titleAr || module.title) : module.title;
                        return (
                          <div key={module.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                            <button onClick={() => toggleModule(module.id)}
                              className="w-full flex items-center justify-between p-5 hover:bg-accent/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{idx + 1}</div>
                                <span className="font-semibold text-start">{moduleTitle}</span>
                                <span className="text-xs text-muted-foreground hidden sm:inline">{module.lessons?.length ?? 0} {lang === "ar" ? "دروس" : "lessons"}</span>
                              </div>
                              {isOpen
                                ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                : <ChevronRight className={cn("w-4 h-4 text-muted-foreground shrink-0", lang === "ar" && "rotate-180")} />}
                            </button>
                            {isOpen && (module.lessons ?? []).length > 0 && (
                              <div className="border-t border-border">
                                {module.lessons.map((lesson: any, li: number) => (
                                  <div key={lesson.id}>
                                    <LessonItem lesson={lesson} index={li} isUnlocked={isActive} lang={lang}
                                      studentId={user.id} onPlay={(url, title) => setActiveVideo({ url, title })}
                                      completedIds={completedIds} onComplete={handleLessonComplete} />
                                    {isActive && (
                                      <div className="px-5 pb-3">
                                        <QuizWidget lessonId={lesson.id} studentId={user.id} />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── PAYMENTS ─── */}
            {activeTab === "payments" && (
              <motion.div key="payments" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {paymentsLoading ? (
                  <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}</div>
                ) : payments.length === 0 ? (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                    <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد مدفوعات بعد" : "No payment records yet"}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((p: any) => (
                      <div key={p.id} className="bg-card border border-border rounded-2xl p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusColors[p.status] ?? "bg-muted text-muted-foreground")}>
                                {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                              </span>
                              <span className="text-xs text-muted-foreground">{methodLabel[p.method] ?? p.method}</span>
                            </div>
                            {p.courseName && <p className="text-sm font-medium">{p.courseName}</p>}
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(p.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                            </p>
                            {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xl font-bold text-primary">${Number(p.amount).toLocaleString()}</p>
                            {p.receiptUrl && (
                              <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1 justify-end mt-1">
                                <ExternalLink className="w-3 h-3" />
                                {lang === "ar" ? "الإيصال" : "Receipt"}
                              </a>
                            )}
                          </div>
                        </div>
                        {(p.status === "pending" || p.status === "approved") && (
                          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              {p.status === "approved"
                                ? (lang === "ar" ? "تمت الموافقة على الدفعة" : "Payment approved — course activation in progress")
                                : (lang === "ar" ? "قيد المراجعة من قِبل الإدارة" : "Under admin review")}
                            </p>
                          </div>
                        )}
                        {p.status === "completed" && (
                          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <p className="text-xs text-muted-foreground">{lang === "ar" ? "تم الدفع بنجاح، الكورس مفعّل" : "Payment complete — course is active"}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── MY COURSES ─── */}
            {activeTab === "my-courses" && (
              <motion.div key="my-courses" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                {(!enrollments || enrollments.length === 0) ? (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
                    <GraduationCap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-medium text-sm text-muted-foreground">{lang === "ar" ? "لم تسجّل في أي كورس بعد" : "No enrollments yet"}</p>
                    <button className="mt-4 text-sm text-primary underline" onClick={() => navigate("/")}>
                      {lang === "ar" ? "استعرض الكورسات" : "Browse Courses"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(Array.isArray(enrollments) ? enrollments : []).map((enroll: any) => (
                      <div key={enroll.id} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">
                            {lang === "ar" ? (enroll.course?.titleAr || enroll.course?.title || `Course #${enroll.courseId}`) : (enroll.course?.title || `Course #${enroll.courseId}`)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lang === "ar" ? "تاريخ التسجيل:" : "Enrolled:"}{" "}
                            {enroll.enrolledAt ? new Date(enroll.enrolledAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : "—"}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0",
                          enroll.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                        )}>
                          {enroll.status === "active" ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "معلق" : "Pending")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── CERTIFICATES ─── */}
            {activeTab === "certificates" && (
              <motion.div key="certificates" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                {(!myCerts || myCerts.length === 0) ? (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
                    <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="font-medium text-sm text-muted-foreground">{lang === "ar" ? "لا توجد شهادات بعد" : "No certificates yet"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{lang === "ar" ? "أتمم الكورس بنجاح لتحصل على شهادتك" : "Complete a course to earn your certificate"}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(Array.isArray(myCerts) ? myCerts : []).map((cert: any) => (
                      <div key={cert.id} className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                            <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">
                              {lang === "ar" ? (cert.course?.titleAr || cert.course?.title || `Course #${cert.courseId}`) : (cert.course?.title || `Course #${cert.courseId}`)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {lang === "ar" ? "تاريخ الإصدار:" : "Issued:"}{" "}
                              {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US") : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="bg-background/60 rounded-xl px-3 py-2">
                          <p className="text-[10px] text-muted-foreground mb-0.5">{lang === "ar" ? "رقم الشهادة" : "Certificate ID"}</p>
                          <p className="font-mono text-xs font-medium tracking-widest">{cert.certificateNumber}</p>
                        </div>
                        <div className="flex gap-2">
                          <a href={`/certificate?code=${cert.certificateNumber}`} target="_blank"
                            className="flex-1 text-center text-xs py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                            {lang === "ar" ? "عرض الشهادة" : "View Certificate"}
                          </a>
                          {cert.pdfUrl && (
                            <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer"
                              className="flex-1 text-center text-xs py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors font-medium">
                              {lang === "ar" ? "تحميل PDF" : "Download PDF"}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── MESSAGES ─── */}
            {activeTab === "messages" && (
              <motion.div key="messages" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <MessagesTab studentId={user.id} studentName={user.name} enrollments={enrollments} lang={lang} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}