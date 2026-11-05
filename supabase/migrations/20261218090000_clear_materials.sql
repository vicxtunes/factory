-- A clean start for parts (owner's decision, 2026-11-05): every material, the
-- usage recorded against them (all at cost 0, since nothing had been bought),
-- the old recipes and the old sheet prices are deleted, before
-- 20261218100000_parts.sql. Orders and their prices are untouched; items made
-- so far just have no production record any more.
--
-- History is append-only by design, so its guards are switched off for this
-- one transaction and back on at the end. Purchases are money (expenses,
-- supplier credit): with any recorded, nothing is deleted. Back up first.

do $$
begin
  if exists (select 1 from material_purchases) then
    raise exception 'Purchases have been recorded: they are money records, so materials are not cleared. Void and review them first.';
  end if;
end;
$$;

alter table material_movements disable trigger material_movements_append_only;
alter table production_record_lines disable trigger production_record_lines_append_only;
alter table production_records disable trigger production_records_void_only;
alter table sheet_price_history disable trigger sheet_price_history_append_only;

delete from material_movements;
delete from production_record_lines;
delete from production_records;
delete from recipe_lines;
delete from sheet_materials;
delete from sheet_prices;
delete from sheet_price_history;
delete from materials;

alter table material_movements enable trigger material_movements_append_only;
alter table production_record_lines enable trigger production_record_lines_append_only;
alter table production_records enable trigger production_records_void_only;
alter table sheet_price_history enable trigger sheet_price_history_append_only;
