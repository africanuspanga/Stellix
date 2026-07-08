import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';

// Import centre core for the 'employees' import type: parse (CSV/XLSX),
// auto-map columns, validate, and execute. Framework-free so the E2E suite
// exercises the exact code the app runs.

export const MAX_IMPORT_ROWS = 1000;

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** header names (lowercased, alphanumeric only) that auto-map to this field */
  aliases: string[];
}

export const EMPLOYEE_IMPORT_FIELDS: ImportField[] = [
  { key: 'employee_number', label: 'Employee number', aliases: ['employeenumber', 'empno', 'staffno', 'number'] },
  { key: 'first_name', label: 'First name', required: true, aliases: ['firstname', 'givenname'] },
  { key: 'middle_name', label: 'Middle name', aliases: ['middlename'] },
  { key: 'last_name', label: 'Last name', required: true, aliases: ['lastname', 'surname', 'familyname'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'date_of_birth', label: 'Date of birth', aliases: ['dateofbirth', 'dob', 'birthdate'] },
  { key: 'national_id', label: 'National ID (NIDA)', aliases: ['nationalid', 'nida', 'idnumber'] },
  { key: 'tin', label: 'TIN', aliases: ['tin', 'tinnumber', 'taxid'] },
  { key: 'nssf_number', label: 'NSSF number', aliases: ['nssf', 'nssfnumber', 'pensionnumber'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phonenumber', 'mobile', 'simu'] },
  { key: 'personal_email', label: 'Personal email', aliases: ['personalemail', 'email'] },
  { key: 'work_email', label: 'Work email', aliases: ['workemail', 'companyemail'] },
  { key: 'physical_address', label: 'Address', aliases: ['address', 'physicaladdress'] },
  { key: 'hire_date', label: 'Hire date', required: true, aliases: ['hiredate', 'startdate', 'dateofemployment', 'employmentdate'] },
  { key: 'employment_type', label: 'Employment type', aliases: ['employmenttype', 'contracttype', 'type'] },
  { key: 'status', label: 'Status', aliases: ['status', 'employmentstatus'] },
  { key: 'department_name', label: 'Department (by name)', aliases: ['department', 'departmentname', 'idara'] },
  { key: 'branch_name', label: 'Branch (by name)', aliases: ['branch', 'branchname', 'tawi'] },
  { key: 'basic_salary', label: 'Basic salary (monthly)', aliases: ['basicsalary', 'salary', 'grosssalary', 'mshahara'] },
  { key: 'bank_name', label: 'Bank name', aliases: ['bankname', 'bank'] },
  { key: 'account_number', label: 'Bank account number', aliases: ['accountnumber', 'bankaccount', 'accountno'] },
  { key: 'mobile_money_number', label: 'Mobile money number', aliases: ['mobilemoneynumber', 'mpesa', 'mobilemoney'] },
];

const EMPLOYMENT_TYPES = new Set([
  'permanent', 'fixed_term', 'part_time', 'casual', 'seasonal',
  'internship', 'apprenticeship', 'consultancy', 'expatriate', 'project_based',
]);
const STATUSES = new Set([
  'onboarding', 'probation', 'active', 'suspended', 'on_leave', 'exiting', 'exited',
]);

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

/** Parse CSV or XLSX bytes into headers + string rows (first sheet). */
export function parseSheet(buffer: ArrayBuffer | Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: 'buffer' in globalThis && Buffer.isBuffer(buffer) ? 'buffer' : 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    dateNF: 'yyyy-mm-dd',
  });
  const [headerRow, ...dataRows] = matrix;
  const headers = (headerRow ?? []).map((h) => String(h ?? '').trim());
  const rows = dataRows
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .slice(0, MAX_IMPORT_ROWS)
    .map((r) => headers.map((_, i) => String(r[i] ?? '').trim()));
  return { headers, rows };
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Guess target-field → column-index mapping from header names. */
export function guessMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    for (const field of EMPLOYEE_IMPORT_FIELDS) {
      if (field.key in mapping) continue;
      if (field.aliases.includes(normalized) || normalizeHeader(field.key) === normalized) {
        mapping[field.key] = index;
        break;
      }
    }
  });
  return mapping;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, and M/D/YY(YY) from Excel. */
export function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  let m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const day = Number(d), month = Number(mo);
    // DD/MM/YYYY preferred; fall back to MM/DD if day slot exceeds 12.
    const [dd, mm] = day > 12 && month <= 12 ? [day, month] : month > 12 ? [month, day] : [day, month];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const [, mo, d, y] = m;
    const year = Number(y) + 2000;
    return `${year}-${String(Number(mo)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  return null;
}

export interface RowError {
  row: number; // 1-based data row number (excluding header)
  message: string;
}

export interface EmployeeImportRecord {
  row: number;
  values: Record<string, string>;
}

export interface ValidationResult {
  valid: EmployeeImportRecord[];
  errors: RowError[];
}

export function validateEmployeeRows(
  rows: string[][],
  mapping: Record<string, number>,
  existingEmployeeNumbers: Set<string>,
): ValidationResult {
  const valid: EmployeeImportRecord[] = [];
  const errors: RowError[] = [];
  const seenNumbers = new Set<string>();

  rows.forEach((cells, i) => {
    const rowNo = i + 1;
    const get = (key: string) => {
      const idx = mapping[key];
      return idx === undefined ? '' : (cells[idx] ?? '').trim();
    };
    const rowErrors: string[] = [];
    const values: Record<string, string> = {};

    for (const field of EMPLOYEE_IMPORT_FIELDS) {
      values[field.key] = get(field.key);
      if (field.required && !values[field.key]) {
        rowErrors.push(`${field.label} is required`);
      }
    }

    for (const dateKey of ['hire_date', 'date_of_birth'] as const) {
      if (values[dateKey]) {
        const normalized = normalizeDate(values[dateKey]);
        if (!normalized) rowErrors.push(`${dateKey.replace(/_/g, ' ')} '${values[dateKey]}' is not a recognizable date`);
        else values[dateKey] = normalized;
      }
    }

    if (values.employment_type) {
      const t = values.employment_type.toLowerCase().replace(/[\s-]+/g, '_');
      if (EMPLOYMENT_TYPES.has(t)) values.employment_type = t;
      else rowErrors.push(`employment type '${values.employment_type}' is not valid`);
    }
    if (values.status) {
      const s = values.status.toLowerCase().replace(/[\s-]+/g, '_');
      if (STATUSES.has(s)) values.status = s;
      else rowErrors.push(`status '${values.status}' is not valid`);
    }
    if (values.gender) {
      const g = values.gender.toLowerCase();
      if (g.startsWith('m')) values.gender = 'male';
      else if (g.startsWith('f')) values.gender = 'female';
      else rowErrors.push(`gender '${values.gender}' is not valid`);
    }
    if (values.basic_salary) {
      const n = Number(values.basic_salary.replace(/[,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) rowErrors.push(`basic salary '${values.basic_salary}' is not a number`);
      else values.basic_salary = String(n);
    }
    if (values.employee_number) {
      if (seenNumbers.has(values.employee_number))
        rowErrors.push(`duplicate employee number '${values.employee_number}' in file`);
      else if (existingEmployeeNumbers.has(values.employee_number))
        rowErrors.push(`employee number '${values.employee_number}' already exists`);
      seenNumbers.add(values.employee_number);
    }

    if (rowErrors.length > 0) errors.push({ row: rowNo, message: rowErrors.join('; ') });
    else valid.push({ row: rowNo, values });
  });

  return { valid, errors };
}

export interface ImportRunSummary {
  created: number;
  failed: Array<{ row: number; message: string }>;
}

/**
 * Execute the import: one employee per valid record, with department/branch
 * looked up by name, plus initial compensation and payment account when
 * provided. Mirrors the single-hire flow's data writes.
 */
export async function runEmployeeImport(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    legalEntityId: string;
    userId: string;
    records: EmployeeImportRecord[];
  },
): Promise<ImportRunSummary> {
  const summary: ImportRunSummary = { created: 0, failed: [] };

  const [{ data: departments }, { data: branches }, { count }] = await Promise.all([
    supabase.from('departments').select('id, name'),
    supabase.from('branches').select('id, name'),
    supabase.from('employees').select('id', { count: 'exact', head: true }),
  ]);
  const deptByName = new Map((departments ?? []).map((d) => [String(d.name).toLowerCase(), d.id as string]));
  const branchByName = new Map((branches ?? []).map((b) => [String(b.name).toLowerCase(), b.id as string]));
  let nextNumber = (count ?? 0) + 1;

  for (const record of input.records) {
    const v = record.values;
    try {
      const departmentId = v.department_name
        ? deptByName.get(v.department_name.toLowerCase()) ?? null
        : null;
      if (v.department_name && !departmentId)
        throw new Error(`department '${v.department_name}' not found`);
      const branchId = v.branch_name
        ? branchByName.get(v.branch_name.toLowerCase()) ?? null
        : null;
      if (v.branch_name && !branchId) throw new Error(`branch '${v.branch_name}' not found`);

      const employeeNumber = v.employee_number || `EMP-${String(nextNumber++).padStart(4, '0')}`;

      const { data: employee, error: empError } = await supabase
        .from('employees')
        .insert({
          tenant_id: input.tenantId,
          legal_entity_id: input.legalEntityId,
          employee_number: employeeNumber,
          first_name: v.first_name,
          middle_name: v.middle_name || null,
          last_name: v.last_name,
          gender: v.gender || null,
          date_of_birth: v.date_of_birth || null,
          national_id: v.national_id || null,
          tin: v.tin || null,
          nssf_number: v.nssf_number || null,
          phone: v.phone || null,
          personal_email: v.personal_email || null,
          work_email: v.work_email || null,
          physical_address: v.physical_address || null,
          hire_date: v.hire_date,
          employment_type: v.employment_type || 'permanent',
          status: v.status || 'active',
        })
        .select('id')
        .single();
      if (empError) throw new Error(empError.message);
      const employeeId = employee.id as string;

      const { error: assignError } = await supabase.from('employee_assignments').insert({
        tenant_id: input.tenantId,
        employee_id: employeeId,
        department_id: departmentId,
        branch_id: branchId,
        effective_from: v.hire_date,
      });
      if (assignError) throw new Error(assignError.message);

      if (v.basic_salary) {
        const { error } = await supabase.from('employee_compensation').insert({
          tenant_id: input.tenantId,
          employee_id: employeeId,
          basic_salary: Number(v.basic_salary),
          effective_from: v.hire_date,
        });
        if (error) throw new Error(error.message);
      }

      if (v.account_number || v.mobile_money_number) {
        const { error } = await supabase.from('employee_bank_accounts').insert({
          tenant_id: input.tenantId,
          employee_id: employeeId,
          payment_method: v.account_number ? 'bank' : 'mobile_money',
          bank_name: v.bank_name || null,
          account_number: v.account_number || null,
          mobile_money_number: v.mobile_money_number || null,
        });
        if (error) throw new Error(error.message);
      }

      summary.created++;
    } catch (e) {
      summary.failed.push({
        row: record.row,
        message: e instanceof Error ? e.message : 'unknown error',
      });
    }
  }

  return summary;
}
