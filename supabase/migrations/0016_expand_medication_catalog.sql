-- Catálogo clínico base para receta inicial. Cada opción sigue siendo un
-- medicamento activo real de la unidad, de modo que register_patient pueda
-- validar su UUID sin aceptar valores sintéticos enviados por el navegador.
insert into public.medications (unit_id, name, strength, pharmaceutical_form, therapeutic_class)
select units.id, catalog.name, catalog.strength, catalog.form, catalog.therapeutic_class
from public.health_units as units
cross join (
  values
    ('Metformina', '500 mg', 'tableta', 'antidiabetic'),
    ('Metformina', '850 mg', 'tableta', 'antidiabetic'),
    ('Glibenclamida', '5 mg', 'tableta', 'antidiabetic'),
    ('Sitagliptina', '100 mg', 'tableta', 'antidiabetic'),
    ('Empagliflozina', '10 mg', 'tableta', 'antidiabetic'),
    ('Insulina NPH', '100 UI/mL', 'solución inyectable', 'antidiabetic'),
    ('Insulina glargina', '100 UI/mL', 'solución inyectable', 'antidiabetic'),
    ('Losartán', '50 mg', 'tableta', 'antihypertensive'),
    ('Enalapril', '10 mg', 'tableta', 'antihypertensive'),
    ('Amlodipino', '5 mg', 'tableta', 'antihypertensive'),
    ('Hidroclorotiazida', '25 mg', 'tableta', 'antihypertensive'),
    ('Telmisartán', '40 mg', 'tableta', 'antihypertensive')
) as catalog(name, strength, form, therapeutic_class)
where not exists (
  select 1
  from public.medications as existing
  where existing.unit_id = units.id
    and lower(existing.name) = lower(catalog.name)
    and existing.strength is not distinct from catalog.strength
);
