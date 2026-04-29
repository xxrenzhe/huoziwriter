import type { Metadata } from "next";
import "./globals.css";
import { AppFeedbackProvider } from "@/components/app-feedback";
import { CommandMenuProvider } from "@/components/command-menu";
import { MARKETING_PROJECT_SURFACE_ALT, MARKETING_PROJECT_SURFACE_PATH } from "@/lib/marketing-project-surface";

export const metadata: Metadata = {
  title: {
    default: "Huozi Writer",
    template: "%s | Huozi Writer",
  },
  description: "反抗机器味的写作 SaaS，面向中文写作者的素材采集、结构生成与微信草稿箱发布系统。",
  openGraph: {
    title: "Huozi Writer",
    description: "反抗机器味的写作 SaaS，面向中文写作者的素材采集、结构生成与微信草稿箱发布系统。",
    images: [
      {
        url: MARKETING_PROJECT_SURFACE_PATH,
        width: 1200,
        height: 630,
        alt: MARKETING_PROJECT_SURFACE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Huozi Writer",
    description: "反抗机器味的写作 SaaS，面向中文写作者的素材采集、结构生成与微信草稿箱发布系统。",
    images: [MARKETING_PROJECT_SURFACE_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <AppFeedbackProvider>
          <CommandMenuProvider>{children}</CommandMenuProvider>
        </AppFeedbackProvider>
      </body>
    </html>
  );
}
