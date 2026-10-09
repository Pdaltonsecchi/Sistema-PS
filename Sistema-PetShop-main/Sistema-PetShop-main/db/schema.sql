-- Estas tablas se crean solas cuando arranca el servidor. Es seguro ejecutarlo muchas veces.
-- Pensado para el plan gratuito de Supabase (PostgreSQL, 500 MB): solo texto y números, sin archivos.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proveedores (a quién se le compra cada cosa).
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catálogo y stock. Un producto se vende por unidad ('u') o suelto por kilo ('kg'): por eso las cantidades
-- admiten hasta 3 decimales. "cost" es el último precio de compra por unidad (o por kilo): sirve para
-- calcular la ganancia de cada venta.
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  species TEXT,
  unit TEXT NOT NULL DEFAULT 'u' CHECK (unit IN ('u', 'kg')),
  stock NUMERIC(12,3) NOT NULL DEFAULT 0 CONSTRAINT products_stock_nonneg CHECK (stock >= 0),
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  -- Bolsa cerrada que se puede "abrir" para vender suelto: kilos que trae y producto suelto al que pasan.
  pack_kg NUMERIC(8,3) CHECK (pack_kg IS NULL OR pack_kg > 0),
  loose_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  barcode TEXT,
  expires_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_supplier_idx ON products(supplier_id);

-- Lista de precios de servicios (baño, peluquería). La duración se usa para la agenda.
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  duration_min INTEGER NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 600)
);

-- Clientes y sus mascotas (sin datos médicos).
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT 'Perro',
  breed TEXT NOT NULL DEFAULT '',
  size TEXT,
  birth DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pets_client_idx ON pets(client_id);

-- Libro de caja: todo lo que entra y sale, con su forma de pago.
CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  on_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('in', 'out')),
  concept TEXT NOT NULL,
  category TEXT NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cash_date_idx ON cash_movements(on_date);
CREATE INDEX IF NOT EXISTS cash_supplier_idx ON cash_movements(supplier_id);

-- Ventas (tickets). Una venta tiene una o más líneas (productos y/o servicios). "cost_total" guarda el
-- costo de la mercadería vendida en ese momento, para calcular la ganancia aunque después cambie el costo.
-- Anular una venta no la borra: queda marcada (voided_at), devuelve el stock y quita el ingreso de la caja.
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  on_date DATE NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  pet_id INTEGER REFERENCES pets(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  cash_id INTEGER REFERENCES cash_movements(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  void_reason TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(on_date);
CREATE INDEX IF NOT EXISTS sales_client_idx ON sales(client_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('product', 'service')),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'u',
  qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items(product_id);

-- Cada entrada o salida de stock queda registrada (fecha, cantidad, motivo, precio).
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  on_date DATE NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  reason TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  cash_id INTEGER REFERENCES cash_movements(id) ON DELETE SET NULL,
  voided BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_mov_product_idx ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS stock_mov_sale_idx ON stock_movements(sale_id);

-- Agenda de peluquería y baño.
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  on_date DATE NOT NULL,
  at_time TIME NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 600),
  status TEXT NOT NULL DEFAULT 'reservado' CHECK (status IN ('reservado', 'confirmado', 'en_curso', 'listo', 'entregado', 'no_vino', 'cancelado')),
  notes TEXT NOT NULL DEFAULT '',
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appt_date_idx ON appointments(on_date);
CREATE INDEX IF NOT EXISTS appt_pet_idx ON appointments(pet_id);
-- Cuándo se confirmó el turno (el pase automático a «Listo para retirar» solo vale para turnos confirmados antes de que terminen).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
-- Bases existentes: el estado «confirmado» se agregó después.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK (status IN ('reservado', 'confirmado', 'en_curso', 'listo', 'entregado', 'no_vino', 'cancelado'));

-- Cierre de caja diario: lo que debería haber en efectivo, lo que se contó y la diferencia.
CREATE TABLE IF NOT EXISTS cash_closings (
  id SERIAL PRIMARY KEY,
  on_date DATE NOT NULL UNIQUE,
  expected NUMERIC(12,2) NOT NULL,
  counted NUMERIC(12,2) NOT NULL,
  difference NUMERIC(12,2) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Copias de seguridad comprimidas (una automática por día).
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  label TEXT NOT NULL,
  auto BOOLEAN NOT NULL DEFAULT FALSE,
  counts TEXT NOT NULL DEFAULT '{}',
  data TEXT NOT NULL
);

-- ============================================================
-- Etapa 2 (auditoría de calidad). Todo es idempotente y no borra datos.
-- ============================================================

-- Configuración del negocio (una sola fila con un JSON: nombre, horario, medios de pago, informe semanal...).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de auditoría de acciones sensibles (precio manual, anulaciones, stock, caja, usuarios...).
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  before TEXT,
  after TEXT,
  reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log(at);

-- Numeración de comprobantes sin huecos: un contador que se incrementa DENTRO de la transacción de la venta
-- (si la venta falla, el número no se consume). Las ventas que ya existían toman su id como número.
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS number INTEGER;
UPDATE sales SET number = id WHERE number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_number_idx ON sales(number);
INSERT INTO counters (name, value) SELECT 'sale', COALESCE(MAX(number), 0) FROM sales ON CONFLICT (name) DO NOTHING;
-- Idempotencia: la misma clave enviada dos veces (doble clic, reintento) no crea dos ventas.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idem_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_idem_idx ON sales(idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_voided_date_idx ON sales(on_date) WHERE voided_at IS NULL;

-- Precio de lista y motivo cuando el administrador cambia el precio de una línea.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS list_price NUMERIC(12,2);
UPDATE sale_items SET list_price = unit_price WHERE list_price IS NULL;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS price_reason TEXT NOT NULL DEFAULT '';

-- Pago mixto: una venta puede cobrarse con varias formas de pago (un ingreso en caja por cada una).
CREATE TABLE IF NOT EXISTS sale_payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  cash_id INTEGER REFERENCES cash_movements(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_cash_idx ON sale_payments(cash_id);
INSERT INTO sale_payments (sale_id, method, amount, cash_id)
  SELECT s.id, s.method, s.total, s.cash_id FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_payments p WHERE p.sale_id = s.id);

-- Productos de regalo/promoción (los únicos que pueden tener precio $ 0).
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS sale_items_kind_idx ON sale_items(kind, product_id);

-- Varios códigos de barras por producto (código único en todo el sistema). Se copian los que ya existían.
CREATE TABLE IF NOT EXISTS product_barcodes (
  code TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON product_barcodes(product_id);
INSERT INTO product_barcodes (code, product_id) SELECT barcode, id FROM products WHERE barcode IS NOT NULL ON CONFLICT (code) DO NOTHING;

-- Agenda: quién atiende (peluquero) y cuándo empezó/terminó de verdad (para comparar con la duración estimada).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS staff TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
-- Recordatorios sin cliente («llamar al distribuidor»): sin mascota, con un título.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ALTER COLUMN pet_id DROP NOT NULL;

-- Envíos del informe semanal por email (con el error, si lo hubo).
CREATE TABLE IF NOT EXISTS report_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week TEXT NOT NULL,
  recipients TEXT NOT NULL DEFAULT '',
  ok BOOLEAN NOT NULL,
  error TEXT NOT NULL DEFAULT ''
);
