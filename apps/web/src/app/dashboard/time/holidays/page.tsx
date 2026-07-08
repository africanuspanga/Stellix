import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { saveTenantHoliday } from "@/app/dashboard/time/leave/actions";
import { OrgFormDialog } from "@/components/org/org-form-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Holiday calendar — Stellix" };

export default async function HolidaysPage() {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const [{ data: publicHolidays }, { data: tenantHolidays }] = await Promise.all([
    supabase
      .from("public_holidays")
      .select("holiday_date, name_en, name_sw, jurisdiction, is_movable")
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year + 1}-12-31`)
      .order("holiday_date"),
    supabase.from("tenant_holidays").select("*").order("holiday_date"),
  ]);

  const combined = [
    ...(publicHolidays ?? []).map((h) => ({
      date: h.holiday_date as string,
      name: h.name_en as string,
      nameSw: h.name_sw as string,
      source: h.jurisdiction as string,
      movable: h.is_movable as boolean,
    })),
    ...(tenantHolidays ?? []).map((h) => ({
      date: h.holiday_date as string,
      name: h.name as string,
      nameSw: "",
      source: "company",
      movable: false,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Holiday calendar</h1>
          <p className="text-sm text-muted-foreground">
            National public holidays plus company-specific days — both excluded
            from leave-day counts.
          </p>
        </div>
        <OrgFormDialog
          action={saveTenantHoliday}
          fields={[
            { name: "holiday_date", label: "Date", type: "date", required: true },
            { name: "name", label: "Holiday name", required: true, placeholder: "e.g. Company anniversary" },
          ]}
          submitLabel="Add holiday"
          title="Add company holiday"
          triggerLabel="Add company holiday"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Holiday</TableHead>
            <TableHead>Swahili</TableHead>
            <TableHead>Applies to</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {combined.map((h, i) => (
            <TableRow key={`${h.date}-${i}`}>
              <TableCell className="font-mono text-xs">{h.date}</TableCell>
              <TableCell className="font-medium">
                {h.name}
                {h.movable && (
                  <Badge className="ml-2" variant="outline">
                    date confirmed yearly
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{h.nameSw || "—"}</TableCell>
              <TableCell>
                <Badge variant={h.source === "company" ? "default" : "secondary"}>
                  {h.source === "both" ? "national" : h.source.replace(/_/g, " ")}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
