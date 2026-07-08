-- 0013: Allow reversal from any finalized state (blueprint §4.8: corrections
-- happen through reversal/adjustment runs — content never mutates; the run
-- is flagged reversed and a correcting run is issued).

create or replace function app.guard_payroll_run_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'paid', 'closed') then
    if not (
      (old.status = 'approved' and new.status in ('paid', 'reversed')) or
      (old.status = 'paid' and new.status in ('closed', 'reversed')) or
      (old.status = 'closed' and new.status = 'reversed')
    ) then
      raise exception 'Payroll run % is % and immutable (non-negotiable #14)',
        old.id, old.status;
    end if;
    if new.totals is distinct from old.totals
      or new.period_year is distinct from old.period_year
      or new.period_month is distinct from old.period_month
      or new.legal_entity_id is distinct from old.legal_entity_id then
      raise exception 'Approved payroll content cannot be modified';
    end if;
  end if;
  return new;
end;
$$;
