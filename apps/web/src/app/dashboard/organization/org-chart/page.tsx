import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPositions, type PositionRow } from "@/lib/org/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Org chart — Stellix" };

interface PositionNode extends PositionRow {
  children: PositionNode[];
}

function buildTree(positions: PositionRow[]): PositionNode[] {
  const nodes = new Map<string, PositionNode>(
    positions.map((p) => [p.id, { ...p, children: [] }]),
  );
  const roots: PositionNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.reports_to_position_id
      ? nodes.get(node.reports_to_position_id)
      : undefined;
    // Treat dangling/self references as roots rather than dropping them.
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function PositionCard({ node, depth }: { node: PositionNode; depth: number }) {
  return (
    <li className="flex flex-col gap-2">
      <Card className="w-fit shadow-none">
        <CardContent className="flex items-center gap-3 px-4 py-2">
          <div>
            <p className="text-sm font-medium leading-tight">{node.title}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {node.code}
              {node.departments?.name ? ` · ${node.departments.name}` : ""}
            </p>
          </div>
          <Badge variant={node.status === "occupied" ? "default" : "outline"}>
            {node.status}
          </Badge>
        </CardContent>
      </Card>
      {node.children.length > 0 && (
        <ul
          className="flex flex-col gap-2 border-l border-border pl-6"
          style={{ marginLeft: depth === 0 ? 0 : undefined }}
        >
          {node.children.map((child) => (
            <PositionCard depth={depth + 1} key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function OrgChartPage() {
  const supabase = await createClient();
  const positions = (await getPositions(supabase)).filter(
    (p) => p.status !== "abolished",
  );
  const roots = buildTree(positions);

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-8">
        <p className="text-sm text-muted-foreground">
          No positions to chart yet. Create positions and set their reporting
          lines to build the organization chart.
        </p>
        <Button
          nativeButton={false}
          render={<Link href="/dashboard/organization/positions" />}
          size="sm"
          variant="outline"
        >
          Go to positions
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium">
        Reporting lines ({positions.length} positions)
      </h2>
      <ul className="flex flex-col gap-4">
        {roots.map((root) => (
          <PositionCard depth={0} key={root.id} node={root} />
        ))}
      </ul>
    </div>
  );
}
