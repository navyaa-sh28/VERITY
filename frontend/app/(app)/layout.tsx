import { AppShell } from "@/components/AppShell";
import { RouteGuard } from "@/components/RouteGuard";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <RouteGuard>{children}</RouteGuard>
    </AppShell>
  );
}

