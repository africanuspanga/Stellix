"use client";

import { useTransition } from "react";
import { CheckIcon, UndoIcon } from "lucide-react";
import { setTaskStatus } from "@/app/dashboard/people/onboarding/actions";
import { Button } from "@/components/ui/button";

export function TaskToggle({
  taskId,
  completed,
}: {
  taskId: string;
  completed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(() => setTaskStatus(taskId, completed ? "pending" : "completed"))
      }
      size="sm"
      variant={completed ? "ghost" : "outline"}
    >
      {completed ? <UndoIcon /> : <CheckIcon />}
      {completed ? "Reopen" : "Complete"}
    </Button>
  );
}
