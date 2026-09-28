import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catenaccio — Tu asistente de fútbol",
  description: "Consulta equipos, jugadores, partidos y clasificaciones.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
