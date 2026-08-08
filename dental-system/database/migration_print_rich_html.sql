-- Texto enriquecido (tipo Word) para encabezados y pies de impresión
ALTER TABLE print_headers
  ADD COLUMN body_html MEDIUMTEXT NULL AFTER extra_text;

ALTER TABLE print_footers
  ADD COLUMN body_html MEDIUMTEXT NULL AFTER body_text;
