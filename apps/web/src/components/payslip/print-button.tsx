"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Save-as-PDF via the browser print dialog (produces a real PDF, no server
 *  dependency). Hidden when printing. */
export function PrintButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()} size="sm" variant="outline">
      <PrinterIcon />
      Download PDF
    </Button>
  );
}
