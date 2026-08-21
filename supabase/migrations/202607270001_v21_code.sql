-- Add V21 supplier product code to products for faster future cost-price imports
ALTER TABLE products ADD COLUMN IF NOT EXISTS v21_code text;
COMMENT ON COLUMN products.v21_code IS 'Marston''s V21 Supplier Product Code — stored after the first name-matched import so subsequent imports match by code rather than fuzzy name';
