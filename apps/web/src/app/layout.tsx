import type { Metadata } from "next";
import "./globals.css";
import { CommandMenuProvider } from "@/components/command-menu";

export const metadata: Metadata = {
  title: {
    default: "Huozi Writer",
    template: "%s | Huozi Writer",
  },
  description: "反抗机器味的写作 SaaS，面向中文写作者的素材采集、结构生成与微信草稿箱发布系统。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <CommandMenuProvider>{children}</CommandMenuProvider>
      </body>
    </html>
  );
}
