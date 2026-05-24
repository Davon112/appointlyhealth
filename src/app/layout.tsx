import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Appointly — Healthcare access, simplified",
  description:
    "Find a primary care doctor who's actually accepting patients, locate sliding-scale clinics, get a ride to your appointment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white text-slate-900">
        <Navbar />
        <main>{children}</main>
        <footer className="border-t border-slate-200 py-8 mt-16 text-center text-sm text-slate-500">
          <p>
            Appointly is a discovery tool. It does not provide medical advice
            and is not affiliated with the providers listed.
          </p>
        </footer>
      </body>
    </html>
  );
}
