import type { Metadata } from "next";
import Sidebar from "./components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Postly",
  description: "Create beautiful postcards",
  icons: { icon: "/Postly-logo-favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-row overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
