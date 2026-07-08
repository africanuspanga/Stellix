'use server';

import { createKimiClient } from '@hr/ai';
import { requirePermission } from '@/lib/authz';
import { explainPayslip, policyQA, summarizeRunAnomalies } from '@/lib/ai/assistants';

export interface AiFormState {
  error?: string;
  answer?: string;
  sources?: Array<{ type: string; ref: string }>;
}

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}

export async function askPolicy(_p: AiFormState, f: FormData): Promise<AiFormState> {
  const auth = await requirePermission('ai.assistant.use');
  if ('error' in auth) return { error: auth.error };

  const question = str(f, 'question');
  if (!question) return { error: 'Ask a question first.' };
  if (question.length > 1000) return { error: 'Please keep the question under 1000 characters.' };

  try {
    const kimi = createKimiClient();
    const result = await policyQA(auth.supabase, kimi.chat, {
      tenantId: auth.tenantId,
      userId: auth.user.id,
      model: kimi.model,
      question,
    });
    return { answer: result.answer, sources: result.sources };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The assistant is unavailable right now.' };
  }
}

export async function askPayslip(_p: AiFormState, f: FormData): Promise<AiFormState> {
  const auth = await requirePermission('ai.assistant.use');
  if ('error' in auth) return { error: auth.error };

  const runId = str(f, 'run_id');
  const employeeId = str(f, 'employee_id');
  const question = str(f, 'question') || 'Explain this payslip to me in simple terms.';
  if (!runId || !employeeId) return { error: 'Choose a payslip first.' };

  try {
    const kimi = createKimiClient();
    const result = await explainPayslip(auth.supabase, kimi.chat, {
      tenantId: auth.tenantId,
      userId: auth.user.id,
      model: kimi.model,
      runId,
      employeeId,
      question,
    });
    return { answer: result.answer, sources: result.sources };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The assistant is unavailable right now.' };
  }
}

export async function askAnomalies(_p: AiFormState, f: FormData): Promise<AiFormState> {
  const auth = await requirePermission('payroll.run.read');
  if ('error' in auth) return { error: auth.error };

  const runId = str(f, 'run_id');
  if (!runId) return { error: 'Choose a payroll run first.' };

  try {
    const kimi = createKimiClient();
    const result = await summarizeRunAnomalies(auth.supabase, kimi.chat, {
      tenantId: auth.tenantId,
      userId: auth.user.id,
      model: kimi.model,
      runId,
    });
    return { answer: result.answer, sources: result.sources };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The assistant is unavailable right now.' };
  }
}
