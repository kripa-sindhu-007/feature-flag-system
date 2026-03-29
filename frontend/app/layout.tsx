import type { Metadata } from "next";
import { Rajdhani, Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const rajdhani = Rajdhani({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Feature Flag System",
  description: "Manage and control feature flags",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${rajdhani.variable} ${nunito.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <TooltipProvider>
            <div className="relative flex min-h-screen flex-col">
              {/* Subtle grid background */}
              <div className="anime-grid-bg pointer-events-none fixed inset-0 opacity-30 dark:opacity-15" />
              <Header />
              <div className="relative flex flex-1">
                <Sidebar />
                <main className="flex-1 p-6">{children}</main>
              </div>
            </div>
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
