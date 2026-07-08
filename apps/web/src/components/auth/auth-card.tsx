import { LogoIcon } from "@/components/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2">
        <LogoIcon className="size-6" />
        <span className="text-lg font-bold tracking-tight">Stellix</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Powering Africa&apos;s Workforce
      </p>
    </main>
  );
}
