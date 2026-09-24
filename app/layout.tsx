import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ViroMania Gestão",
  description: "Sistema de gestão financeira e operacional da ViroMania",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-100 text-slate-800">
        {children}
      </body>
    </html>
  );
}