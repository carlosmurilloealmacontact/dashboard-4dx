import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard 4DX | Almaexperience",
  description: "Seguimiento 4DX por rol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className={`${geist.className} bg-gray-950 text-white min-h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
