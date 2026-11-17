"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  cloudApi,
  type CloudResumeSummary,
  type CloudSession,
  type CloudUser,
  type ShareInfo,
  type ShareOptions,
} from "@/lib/cloud";
import { saveResume } from "@/lib/storage";
import { useResumeStore } from "@/store/useResumeStore";
import { Button, Field, TextInput } from "@/components/ui";
import { Icon } from "@/components/icons";

type Mode = "login" | "register" | "reset";
type Method = "phone" | "email";

const ALLOWED_EMAIL_DOMAINS = [
  "qq.com",
  "foxmail.com",
  "163.com",
  "126.com",
  "yeah.net",
];

const EMAIL_HINT = "仅支持 QQ 邮箱（qq.com / foxmail.com）与网易邮箱（163.com / 126.com / yeah.net）";
const EMAIL_DOMAIN_HINT = "支持 qq.com / foxmail.com / 163.com / 126.com / yeah.net";

function isAllowedEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(trimmed.slice(at + 1));
}

function normalizePhoneInput(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  return digits.startsWith("+86") ? digits.slice(3) : digits;
}

/** 从 UA 里解析出可读的设备/浏览器标签，解析不出时退回「未知设备」。 */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "未知设备";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /(iPhone|iPad|iPod)/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "未知系统";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "浏览器";
  return `${os} · ${browser}`;
}

export function CloudMenu() {
  const doc = useResumeStore((state) => state.doc);
  const overflowPx = useResumeStore((state) => state.overflowPx);
  const reset = useResumeStore((state) => state.reset);

  const [user, setUser] = useState<CloudUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [method, setMethod] = useState<Method>("phone");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resetPwd, setResetPwd] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<"keep" | "0" | "7" | "30" | "90">(
    "0",
  );
  const [cloudResumes, setCloudResumes] = useState<CloudResumeSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void cloudApi
      .me()
      .then((result) => {
        if (!cancelled) setUser(result.user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setShare(null);
      setCloudResumes([]);
      setSessions([]);
      return;
    }
    let cancelled = false;
    void cloudApi
      .getShare()
      .then((result) => {
        if (!cancelled) {
          setShare(result.share);
          setExpiryChoice(result.share ? "keep" : "0");
        }
      })
      .catch(() => undefined);
    void cloudApi
      .listResumes()
      .then((result) => {
        if (!cancelled) setCloudResumes(result.resumes);
      })
      .catch(() => undefined);
    void cloudApi
      .listSessions()
      .then((result) => {
        if (!cancelled) setSessions(result.sessions);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 验证码重发倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const requestCode = async () => {
    if (sendingCode || cooldown > 0 || busy) return;
    setError(null);
    setMessage(null);

    const isReset = mode === "reset";
    const value = isReset ? account.trim().toLowerCase() : normalizePhoneInput(account);
    if (isReset) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError("请输入有效的邮箱地址");
        return;
      }
      if (!isAllowedEmail(value)) {
        setError(EMAIL_HINT);
        return;
      }
    } else if (!/^1[3-9]\d{9}$/.test(value)) {
      setError("请输入 11 位手机号");
      return;
    }

    setAccount(value);
    setSendingCode(true);
    try {
      const result = await cloudApi.sendCode(value, isReset ? "reset" : "login");
      setCooldown(result.resendIn || 60);
      setMessage(
        `${isReset ? "验证码已发送到邮箱" : "验证码已发送"}，${Math.max(
          1,
          Math.round(result.expiresIn / 60),
        )} 分钟内有效`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setMessage(null);

    if (mode === "reset") {
      const email = account.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("请输入有效的邮箱地址");
        return;
      }
      if (!isAllowedEmail(email)) {
        setError(EMAIL_HINT);
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setError("请输入 6 位验证码");
        return;
      }
      if (resetPwd.length < 8) {
        setError("新密码至少 8 位");
        return;
      }
      setAccount(email);
      setBusy(true);
      try {
        await cloudApi.resetPassword(email, code, resetPwd);
        setMode("login");
        setResetPwd("");
        setCode("");
        setMessage("密码已重置，请用新密码登录");
      } catch (caught) {
        setError((caught as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    const value =
      method === "phone" ? normalizePhoneInput(account) : account.trim().toLowerCase();
    if (!value) {
      setError(method === "phone" ? "请输入手机号" : "请输入邮箱");
      return;
    }
    if (method === "phone" && !/^1[3-9]\d{9}$/.test(value)) {
      setError("请输入 11 位手机号");
      return;
    }

    if (method === "phone") {
      if (!/^\d{6}$/.test(code)) {
        setError("请输入 6 位验证码");
        return;
      }
      setAccount(value);
      setBusy(true);
      try {
        const result = await cloudApi.loginWithCode(value, code);
        setUser(result.user);
        setCode("");
        setMessage("已登录");
      } catch (caught) {
        setError((caught as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("请输入有效的邮箱地址");
      return;
    }
    if (!isAllowedEmail(value)) {
      setError(EMAIL_HINT);
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("密码至少 8 位");
      return;
    }

    setAccount(value);
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await cloudApi.login(value, password)
          : await cloudApi.register(value, password);
      setUser(result.user);
      setPassword("");
      setMessage(mode === "login" ? "已登录" : "账号已创建，自动登录");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changePwd = async () => {
    if (pwdBusy) return;
    setPwdError(null);
    setPwdMessage(null);
    if (nextPwd.length < 8) {
      setPwdError("新密码至少 8 位");
      return;
    }
    setPwdBusy(true);
    try {
      await cloudApi.changePassword(currentPwd, nextPwd);
      setPwdMessage("密码已更新");
      setCurrentPwd("");
      setNextPwd("");
    } catch (caught) {
      setPwdError((caught as Error).message);
    } finally {
      setPwdBusy(false);
    }
  };

  const codeField = (hint: string) => (
    <div>
      <span className="field-label">验证码</span>
      <div className="flex gap-2">
        <TextInput
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          placeholder="6 位验证码"
          className="flex-1"
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        <Button
          className="shrink-0"
          disabled={sendingCode || cooldown > 0 || busy}
          onClick={() => void requestCode()}
        >
          {cooldown > 0
            ? `${cooldown}s 后重发`
            : sendingCode
              ? "发送中…"
              : "获取验证码"}
        </Button>
      </div>
      <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>
    </div>
  );

  const refreshCloudResumes = async () => {
    try {
      const result = await cloudApi.listResumes();
      setCloudResumes(result.resumes);
    } catch {
      /* 列表刷新失败不阻塞主操作 */
    }
  };

  const push = async () => {
    if (!doc || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cloudApi.push(doc);
      await refreshCloudResumes();
      setMessage(
        `已保存到云端 · ${new Date(result.updatedAt).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadCloudResume = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cloudApi.getResume(id);
      if (
        !window.confirm(
          `载入「${result.resume.title}」会覆盖当前内容，继续？`,
        )
      ) {
        return;
      }
      await saveResume(result.resume.doc);
      reset(result.resume.doc);
      setMessage(`已载入「${result.resume.title}」`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeCloudResume = async (id: string) => {
    if (busy) return;
    if (!window.confirm("删除云端简历后不可恢复，继续？")) return;
    setBusy(true);
    setError(null);
    try {
      await cloudApi.deleteResume(id);
      await refreshCloudResumes();
      setMessage("云端简历已删除");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pull = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cloudApi.pull();
      if (!result.resume) {
        setMessage("云端还没有简历，先保存一次。");
        return;
      }
      if (!window.confirm("从云端载入会覆盖当前内容，继续？")) return;
      reset(result.resume.doc);
      setMessage(
        `已载入云端版本 · ${new Date(result.resume.updatedAt).toLocaleString("zh-CN")}`,
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = share && origin ? `${origin}/r/${share.token}` : "";
  const expiryText = share?.expiresAt
    ? `有效至 ${new Date(share.expiresAt).toLocaleDateString("zh-CN")}`
    : "永久有效";

  const saveShare = async (
    options: ShareOptions,
    successMessage: string,
    confirmOverflow = false,
  ) => {
    if (!doc || shareBusy) return;
    if (
      confirmOverflow &&
      overflowPx > 0 &&
      !window.confirm("当前内容超出一页，分享页会按一页裁切。仍要继续？")
    ) {
      return;
    }
    setShareBusy(true);
    setError(null);
    setShareMessage(null);
    try {
      const result = await cloudApi.createShare(doc, options);
      setShare(result);
      setShareMessage(successMessage);
      setNewPassword("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const createShare = () => {
    const expiresInDays = expiryChoice === "0" ? null : Number(expiryChoice);
    return saveShare(
      {
        password: newPassword.trim() ? newPassword : undefined,
        expiresInDays,
      },
      "分享链接已创建",
      true,
    );
  };

  const updateShareContent = () => saveShare({}, "分享内容已更新", true);

  const setSharePassword = () => {
    if (!newPassword) return;
    return saveShare({ password: newPassword }, "访问密码已保存");
  };

  const removeSharePassword = () => saveShare({ password: null }, "访问密码已移除");

  const applyShareExpiry = () => {
    if (expiryChoice === "keep") return;
    const expiresInDays = expiryChoice === "0" ? null : Number(expiryChoice);
    return saveShare({ expiresInDays }, "有效期已更新");
  };

  const revokeShare = async () => {
    if (shareBusy) return;
    if (!window.confirm("撤销后链接立即失效，继续？")) return;
    setShareBusy(true);
    setError(null);
    try {
      await cloudApi.deleteShare();
      setShare(null);
      setShareMessage("分享已撤销，链接立即失效");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("链接已复制");
    } catch {
      setShareMessage("复制失败，请手动选择链接");
    }
  };

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await cloudApi.logout();
      setUser(null);
      setShare(null);
      setShareMessage(null);
      setSessions([]);
      setMessage("已退出登录");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const refreshSessions = async () => {
    const result = await cloudApi.listSessions();
    setSessions(result.sessions);
  };

  const revokeOtherDevices = async () => {
    if (sessionsBusy) return;
    setSessionsBusy(true);
    setError(null);
    try {
      const result = await cloudApi.revokeOtherSessions();
      await refreshSessions();
      setMessage(
        result.revoked > 0
          ? `已退出 ${result.revoked} 个其他设备`
          : "没有其他登录设备",
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSessionsBusy(false);
    }
  };

  const revokeOneDevice = async (id: string) => {
    if (sessionsBusy) return;
    setSessionsBusy(true);
    setError(null);
    try {
      const result = await cloudApi.revokeSession(id);
      if (result.current) {
        setUser(null);
        setSessions([]);
        setMessage("已退出登录");
        return;
      }
      await refreshSessions();
      setMessage("已退出该设备");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSessionsBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setMessage(null);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
        title="云端同步"
      >
        <Icon name="cloud" size={15} className="text-slate-500" />
        {user ? "云端" : "登录"}
      </button>

      {/*
        站点 header 带 backdrop-blur，backdrop-filter 会让它成为 position:fixed
        后代的包含块：弹窗若留在 header 里，就会被居中到 64px 高的 header 上，
        上半截顶出视口（历史 bug）。因此挂到 document.body。
      */}
      {open && mounted
        ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/45 p-6 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div className="max-h-[calc(100vh-3rem)] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">
                    {user ? "云端同步" : mode === "reset" ? "重置密码" : "登录 / 注册"}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    云端同步可选，本地编辑无需账号。
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>

              {!checked ? (
                <p className="mt-5 text-[12px] text-slate-400">正在检查登录状态…</p>
              ) : user ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                    已登录：
                    <span className="font-medium text-slate-800">
                      {user.email ?? user.phone ?? ""}
                    </span>
                  </div>

                  {doc ? (
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void push()}
                      >
                        保存到云端
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void pull()}
                      >
                        从云端载入
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      打开编辑器后即可保存或载入云端简历。
                    </p>
                  )}

                  <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>云端简历</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {cloudResumes.length} 份
                        </span>
                      </summary>
                      <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                        {cloudResumes.length === 0 ? (
                          <p className="text-[10px] leading-relaxed text-slate-400">
                            云端还没有简历，先点「保存到云端」。
                          </p>
                        ) : (
                          cloudResumes.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-medium text-slate-700">
                                  {item.title}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => void loadCloudResume(item.id)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-slate-100"
                                >
                                  载入
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeCloudResume(item.id)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500">分享链接</span>
                      {share ? (
                        <span className="text-[10px] text-emerald-600">已开启</span>
                      ) : null}
                    </div>

                    {share ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-1.5">
                          <input
                            readOnly
                            value={shareUrl}
                            onFocus={(event) => event.currentTarget.select()}
                            className="field-input flex-1 text-[11px]"
                            aria-label="分享链接"
                          />
                          <Button size="sm" onClick={() => void copyShare()}>
                            复制
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-400">
                          <span>{share.hasPassword ? "已设密码" : "无密码"}</span>
                          <span>·</span>
                          <span>{expiryText}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!doc || shareBusy}
                            onClick={() => void updateShareContent()}
                          >
                            更新内容
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={shareBusy}
                            onClick={() => void revokeShare()}
                          >
                            撤销分享
                          </Button>
                        </div>

                        <details className="rounded border border-slate-100 bg-slate-50/60 px-2 py-1.5">
                          <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500">
                            分享设置
                          </summary>
                          <div className="mt-2 space-y-2">
                            <div className="flex gap-1.5">
                              <input
                                type="password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder={
                                  share.hasPassword ? "更换访问密码" : "设置访问密码"
                                }
                                className="field-input flex-1 text-[11px]"
                                aria-label="分享密码"
                              />
                              <Button
                                size="sm"
                                disabled={!newPassword || shareBusy}
                                onClick={() => void setSharePassword()}
                              >
                                保存
                              </Button>
                            </div>
                            {share.hasPassword ? (
                              <button
                                type="button"
                                onClick={() => void removeSharePassword()}
                                className="text-[10px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                              >
                                移除密码
                              </button>
                            ) : null}
                            <div className="flex gap-1.5">
                              <select
                                value={expiryChoice}
                                onChange={(event) =>
                                  setExpiryChoice(
                                    event.target.value as
                                      | "keep"
                                      | "0"
                                      | "7"
                                      | "30"
                                      | "90",
                                  )
                                }
                                className="field-input flex-1 text-[11px]"
                                aria-label="分享有效期"
                              >
                                <option value="keep">保持当前有效期</option>
                                <option value="0">永久有效</option>
                                <option value="7">7 天</option>
                                <option value="30">30 天</option>
                                <option value="90">90 天</option>
                              </select>
                              <Button
                                size="sm"
                                disabled={expiryChoice === "keep" || shareBusy}
                                onClick={() => void applyShareExpiry()}
                              >
                                应用
                              </Button>
                            </div>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="访问密码（可选，4 位以上）"
                          className="field-input text-[11px]"
                          aria-label="分享密码"
                        />
                        <select
                          value={expiryChoice}
                          onChange={(event) =>
                            setExpiryChoice(
                              event.target.value as "0" | "7" | "30" | "90",
                            )
                          }
                          className="field-input text-[11px]"
                          aria-label="分享有效期"
                        >
                          <option value="0">永久有效</option>
                          <option value="7">7 天</option>
                          <option value="30">30 天</option>
                          <option value="90">90 天</option>
                        </select>
                        <Button
                          size="sm"
                          variant="primary"
                          className="w-full"
                          disabled={!doc || shareBusy}
                          onClick={() => void createShare()}
                        >
                          创建分享链接
                        </Button>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                          只读公开链接，不暴露账号信息；密码与有效期可在创建后调整。
                        </p>
                      </div>
                    )}

                    {shareMessage ? (
                      <p className="mt-2 rounded bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700">
                        {shareMessage}
                      </p>
                    ) : null}
                  </div>

                  {user.hasPassword ? (
                    <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
                      <details>
                        <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500">
                          修改密码
                        </summary>
                        <div className="mt-2 space-y-2">
                          <input
                            type="password"
                            value={currentPwd}
                            autoComplete="current-password"
                            onChange={(event) => setCurrentPwd(event.target.value)}
                            placeholder="当前密码"
                            className="field-input text-[11px]"
                            aria-label="当前密码"
                          />
                          <input
                            type="password"
                            value={nextPwd}
                            autoComplete="new-password"
                            onChange={(event) => setNextPwd(event.target.value)}
                            placeholder="新密码（至少 8 位）"
                            className="field-input text-[11px]"
                            aria-label="新密码"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              disabled={pwdBusy || !currentPwd || nextPwd.length < 8}
                              onClick={() => void changePwd()}
                            >
                              保存
                            </Button>
                            {pwdError ? (
                              <span className="text-[10px] text-rose-600">{pwdError}</span>
                            ) : null}
                            {pwdMessage ? (
                              <span className="text-[10px] text-emerald-600">
                                {pwdMessage}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : null}

                  <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>登录设备</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {sessions.length} 台
                        </span>
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {sessions.length === 0 ? (
                          <p className="text-[10px] text-slate-400">暂无登录记录</p>
                        ) : (
                          sessions.map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-medium text-slate-700">
                                  {deviceLabel(session.userAgent)}
                                  {session.current ? (
                                    <span className="ml-1 text-[10px] font-normal text-emerald-600">
                                      当前
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(session.createdAt).toLocaleString("zh-CN", {
                                    month: "numeric",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                              {session.current ? null : (
                                <button
                                  type="button"
                                  onClick={() => void revokeOneDevice(session.id)}
                                  disabled={sessionsBusy}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                                >
                                  退出
                                </button>
                              )}
                            </div>
                          ))
                        )}
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={
                            sessionsBusy ||
                            sessions.filter((session) => !session.current).length === 0
                          }
                          onClick={() => void revokeOtherDevices()}
                        >
                          退出其他设备
                        </Button>
                      </div>
                    </details>
                  </div>

                  {message ? (
                    <p className="rounded bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700">
                      {message}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void logout()}
                    disabled={busy}
                    className="text-[11px] text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline"
                  >
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {/* 登录方式：手机号 / 邮箱（重置密码时固定邮箱） */}
                  {mode !== "reset" ? (
                    <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      {(
                        [
                          ["phone", "手机号登录"],
                          ["email", "邮箱登录"],
                        ] as Array<[Method, string]>
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setMethod(value);
                            setAccount("");
                            setCode("");
                            setError(null);
                            setMessage(null);
                            // 手机号验证码登录即注册，不需要单独的注册态
                            if (value === "phone") setMode("login");
                          }}
                          className={
                            method === value
                              ? "rounded bg-white px-3 py-1.5 text-[12px] font-medium text-slate-900 shadow-sm"
                              : "rounded px-3 py-1.5 text-[12px] text-slate-500 hover:text-slate-700"
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {method === "phone" && mode !== "reset" ? (
                    <Field label="手机号">
                      <TextInput
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={11}
                        value={account}
                        placeholder="请输入 11 位手机号"
                        onChange={(event) => setAccount(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void submit();
                        }}
                      />
                    </Field>
                  ) : (
                    <Field label="邮箱" hint={EMAIL_DOMAIN_HINT}>
                      <TextInput
                        type="email"
                        autoComplete="email"
                        value={account}
                        placeholder="name@qq.com / name@163.com"
                        onChange={(event) => setAccount(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void submit();
                        }}
                      />
                    </Field>
                  )}

                  {method === "phone" ? (
                    codeField("未注册的手机号验证成功后自动创建账号")
                  ) : mode === "reset" ? (
                    <>
                      {codeField("请输入邮箱收到的 6 位验证码")}
                      <Field label="新密码" hint="至少 8 位">
                        <TextInput
                          type="password"
                          autoComplete="new-password"
                          value={resetPwd}
                          placeholder="••••••••"
                          onChange={(event) => setResetPwd(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void submit();
                          }}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field
                        label="密码"
                        hint={mode === "register" ? "至少 8 位" : undefined}
                      >
                        <TextInput
                          type="password"
                          autoComplete={
                            mode === "login" ? "current-password" : "new-password"
                          }
                          value={password}
                          placeholder="••••••••"
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void submit();
                          }}
                        />
                      </Field>
                      <div className="-mt-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setMode("reset");
                            setMethod("email");
                            setPassword("");
                            setCode("");
                            setError(null);
                            setMessage(null);
                          }}
                          className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                        >
                          忘记密码？
                        </button>
                      </div>
                    </>
                  )}

                  {error ? (
                    <p className="rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">
                      {error}
                    </p>
                  ) : null}
                  {message ? (
                    <p className="rounded bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700">
                      {message}
                    </p>
                  ) : null}

                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy
                      ? "处理中…"
                      : mode === "login"
                        ? "登录"
                        : mode === "reset"
                          ? "重置密码"
                          : "创建账号"}
                  </Button>

                  {mode === "reset" ? (
                    <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                      <span>想起密码了？</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setCode("");
                          setResetPwd("");
                          setError(null);
                          setMessage(null);
                        }}
                        className="font-medium text-slate-700 underline-offset-2 hover:underline"
                      >
                        返回登录
                      </button>
                    </div>
                  ) : method === "email" ? (
                    <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                      <span>{mode === "login" ? "还没有账号？" : "已有账号？"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMode(mode === "login" ? "register" : "login");
                          setError(null);
                          setMessage(null);
                        }}
                        className="font-medium text-slate-700 underline-offset-2 hover:underline"
                      >
                        {mode === "login" ? "立即注册" : "直接登录"}
                      </button>
                    </div>
                  ) : null}

                  <p className="text-[10px] leading-relaxed text-slate-400">
                    {mode === "reset"
                      ? "验证码 5 分钟内有效；重置成功后请用新密码登录。"
                      : method === "phone"
                        ? "账号用于跨设备同步简历；验证码 5 分钟内有效，登录状态保持 30 天。"
                        : "账号用于跨设备同步简历；密码只保存哈希，简历以 JSON 存储在你的服务器。"}
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
