import type { Metadata } from "next";
import Link from "next/link";
import {
  BanknoteIcon,
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  SparklesIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Huduma — Stellix" };

export default async function HudumaPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const { data: me } = await supabase
    .from("employees")
    .select("first_name")
    .eq("user_id", context?.user.id ?? "")
    .maybeSingle();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("hr_whatsapp_number")
    .eq("id", context?.activeTenant?.id ?? "")
    .maybeSingle();

  const services = [
    {
      href: "/dashboard/me",
      icon: <BanknoteIcon className="size-6" />,
      sw: "Pakua payslip",
      en: "Get my payslip",
    },
    {
      href: "/dashboard/time/leave",
      icon: <CalendarDaysIcon className="size-6" />,
      sw: "Likizo — salio na maombi",
      en: "Leave — balance & requests",
    },
    {
      href: "/dashboard/time/attendance",
      icon: <MapPinIcon className="size-6" />,
      sw: "Mahudhurio — ingia / toka",
      en: "Attendance — check in / out",
    },
    {
      href: "/dashboard/me",
      icon: <ClockIcon className="size-6" />,
      sw: "Ratiba yangu ya kazi",
      en: "My shift schedule",
    },
    {
      href: "/dashboard/experience/service-desk",
      icon: <MessageSquareTextIcon className="size-6" />,
      sw: "Wasiliana na HR",
      en: "Contact HR",
    },
    {
      href: "/dashboard/ai",
      icon: <SparklesIcon className="size-6" />,
      sw: "Uliza swali (AI)",
      en: "Ask a question (AI)",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Karibu{me?.first_name ? `, ${me.first_name}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Huduma za wafanyakazi · Employee services
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {services.map((service) => (
          <Link
            className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
            href={service.href}
            key={service.sw}
          >
            {service.icon}
            <div>
              <p className="font-medium">{service.sw}</p>
              <p className="text-xs text-muted-foreground">{service.en}</p>
            </div>
          </Link>
        ))}
        {tenant?.hr_whatsapp_number && (
          <a
            className="flex items-center gap-4 rounded-xl border border-dashed p-4 transition-colors hover:bg-muted/50"
            href={`https://wa.me/${tenant.hr_whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Habari HR, naomba msaada.")}`}
            rel="noreferrer"
            target="_blank"
          >
            <MessageSquareTextIcon className="size-6" />
            <div>
              <p className="font-medium">HR kwenye WhatsApp</p>
              <p className="text-xs text-muted-foreground">Opens WhatsApp directly</p>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
