"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { uiPrimitives } from "@huoziwriter/ui";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("huozi");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json.success) {
      setError(json.error || "登录失败");
      return;
    }
    if (json.data.mustChangePassword) {
      router.push("/change-password");
    } else {
      router.push(json.data.role === "admin" ? "/admin" : "/dashboard");
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm text-stone-600">用户名</label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={uiPrimitives.input}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-stone-600">密码</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={uiPrimitives.input}
          placeholder="输入管理员或已分配账号密码"
        />
      </div>
      {error ? <div className="text-sm text-cinnabar">{error}</div> : null}
      <button disabled={loading} className={uiPrimitives.primaryButtonFull}>
        {loading ? "登录中..." : "进入系统"}
      </button>
    </form>
  );
}

export function ChangePasswordForm({
  mustChange = true,
}: {
  mustChange?: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (nextPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json.success) {
      setError(json.error || "修改密码失败");
      return;
    }
    router.push(json.data.role === "admin" ? "/admin" : "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-sm leading-7 text-stone-600">
        {mustChange ? "这是管理员发放的初始密码，首次登录后必须立即修改。" : "为了账号安全，建议定期轮换密码。"}
      </div>
      <div className="space-y-2">
        <label className="text-sm text-stone-600">当前密码</label>
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={uiPrimitives.input} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-stone-600">新密码</label>
        <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className={uiPrimitives.input} />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-stone-600">确认新密码</label>
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={uiPrimitives.input} />
      </div>
      {error ? <div className="text-sm text-cinnabar">{error}</div> : null}
      <button disabled={loading} className={uiPrimitives.primaryButtonFull}>
        {loading ? "提交中..." : "更新密码"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={uiPrimitives.secondaryButton}>
      退出登录
    </button>
  );
}
