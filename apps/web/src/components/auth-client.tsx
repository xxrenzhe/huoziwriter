"use client";
import { Button, Input, cn } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const authFormClassName = cn("space-y-5");
const authFieldClassName = cn("space-y-2");
const authLabelClassName = cn("text-sm", "text-inkSoft");
const authDescriptionClassName = cn("text-sm", "leading-7", "text-inkSoft");
const authErrorClassName = cn("text-sm", "text-cinnabar");

function FormError({
  error,
  errorId,
}: {
  error: string | null;
  errorId?: string;
}) {
  return (
    <div aria-live="polite">
      {error ? <div id={errorId} role="alert" className={authErrorClassName}>{error}</div> : null}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("huozi");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorId = error ? "login-form-error" : undefined;

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
      router.push(json.data.role === "admin" ? "/admin" : "/warroom");
    }
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className={authFormClassName}>
      <div className={authFieldClassName}>
        <label htmlFor="login-username" className={authLabelClassName}>用户名</label>
        <Input
          id="login-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="输入用户名"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      </div>
      <div className={authFieldClassName}>
        <label htmlFor="login-password" className={authLabelClassName}>密码</label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入管理账号或已分配账号密码"
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      </div>
      <FormError error={error} errorId={errorId} />
      <Button type="submit" variant="primary" fullWidth disabled={loading}>
        {loading ? "登录中…" : "进入系统"}
      </Button>
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
  const errorId = error ? "change-password-form-error" : undefined;

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
    router.push(json.data.role === "admin" ? "/admin" : "/warroom");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className={authFormClassName}>
      <div className={authDescriptionClassName}>
        {mustChange ? "当前仍在使用初始密码，首次登录后必须立即修改。" : "为了账号安全，建议定期轮换密码。"}
      </div>
      <div className={authFieldClassName}>
        <label htmlFor="current-password" className={authLabelClassName}>当前密码</label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      </div>
      <div className={authFieldClassName}>
        <label htmlFor="next-password" className={authLabelClassName}>新密码</label>
        <Input
          id="next-password"
          type="password"
          value={nextPassword}
          onChange={(event) => setNextPassword(event.target.value)}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      </div>
      <div className={authFieldClassName}>
        <label htmlFor="confirm-password" className={authLabelClassName}>确认新密码</label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      </div>
      <FormError error={error} errorId={errorId} />
      <Button type="submit" variant="primary" fullWidth disabled={loading}>
        {loading ? "提交中…" : "更新密码"}
      </Button>
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
    <Button onClick={handleLogout} variant="secondary">
      退出登录
    </Button>
  );
}
