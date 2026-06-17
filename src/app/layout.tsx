import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heritage Lab Intranet",
  description: "Internal tools for Heritage Lab staff and board.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
