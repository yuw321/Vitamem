import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vitamem Demo",
  description:
    "Interactive demo for Vitamem — long-term memory for AI that works the way human memory does.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-dk text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
