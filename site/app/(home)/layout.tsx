import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn JavaScript",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
