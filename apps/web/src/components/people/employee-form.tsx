"use client";

import { useActionState } from "react";
import { createEmployee, type PeopleFormState } from "@/app/dashboard/people/employees/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface Option {
  value: string;
  label: string;
}

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  options,
  emptyOption,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: Option[];
  emptyOption?: string;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {options ? (
        <select className={selectClass} id={name} name={name} required={required}>
          {emptyOption !== undefined && <option value="">{emptyOption}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={name}
          name={name}
          placeholder={placeholder}
          required={required}
          step={step}
          type={type}
        />
      )}
    </div>
  );
}

const EMPLOYMENT_TYPES: Option[] = [
  "permanent", "fixed_term", "part_time", "casual", "seasonal",
  "internship", "apprenticeship", "consultancy", "expatriate", "project_based",
].map((t) => ({ value: t, label: t.replace(/_/g, " ") }));

export function EmployeeForm({
  entities,
  positions,
  departments,
  branches,
  managers,
}: {
  entities: Option[];
  positions: Option[];
  departments: Option[];
  branches: Option[];
  managers: Option[];
}) {
  const [state, action, pending] = useActionState<PeopleFormState, FormData>(
    createEmployee,
    {},
  );

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" name="first_name" required />
          <Field label="Middle name" name="middle_name" />
          <Field label="Last name" name="last_name" required />
          <Field
            emptyOption="Not specified"
            label="Gender"
            name="gender"
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
          />
          <Field label="Date of birth" name="date_of_birth" type="date" />
          <Field label="Phone" name="phone" placeholder="+255 7XX XXX XXX" />
          <Field label="Personal email" name="personal_email" type="email" />
          <Field label="Work email" name="work_email" type="email" />
          <Field label="National ID (NIDA)" name="national_id" />
          <Field label="TIN" name="tin" />
          <Field label="NSSF number" name="nssf_number" />
          <Field label="Physical address" name="physical_address" />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Legal entity" name="legal_entity_id" options={entities} required />
          <Field label="Employee number (blank = auto)" name="employee_number" placeholder="EMP-0001" />
          <Field label="Hire date" name="hire_date" required type="date" />
          <Field label="Employment type" name="employment_type" options={EMPLOYMENT_TYPES} />
          <Field
            label="Initial status"
            name="status"
            options={[
              { value: "onboarding", label: "Onboarding" },
              { value: "probation", label: "Probation" },
              { value: "active", label: "Active" },
            ]}
          />
          <Field label="Probation end date" name="probation_end_date" type="date" />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Placement &amp; pay</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field emptyOption="No position" label="Position" name="position_id" options={positions} />
          <Field emptyOption="No department" label="Department" name="department_id" options={departments} />
          <Field emptyOption="No branch" label="Branch" name="branch_id" options={branches} />
          <Field emptyOption="No manager" label="Manager" name="manager_employee_id" options={managers} />
          <Field label="Basic salary (monthly)" name="basic_salary" step="0.01" type="number" />
          <Field label="Currency" name="currency" placeholder="TZS" />
        </CardContent>
      </Card>

      <div>
        <Button disabled={pending} type="submit">
          {pending ? "Creating…" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
