"use client";

import { useTransition } from "react";
import { CheckIcon, UndoIcon } from "lucide-react";
import { setOffboardingTask } from "@/app/dashboard/people/offboarding/actions";
import { Button } from "@/components/ui/button";

export function OffboardingTaskToggle({
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
        startTransition(() => setOffboardingTask(taskId, completed ? "pending" : "completed"))
      }
      size="sm"
      variant={completed ? "ghost" : "outline"}
    >
      {completed ? <UndoIcon /> : <CheckIcon />}
      {completed ? "Reopen" : "Done"}
    </Button>
  );
}
