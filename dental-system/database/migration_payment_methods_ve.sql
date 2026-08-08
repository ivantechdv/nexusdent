-- Métodos de pago VE + referencia (excepto efectivo)
ALTER TABLE payments
  MODIFY COLUMN payment_method
    ENUM('CASH', 'CARD', 'TRANSFER', 'ZELLE', 'PAGO_MOVIL') NOT NULL;

ALTER TABLE payments
  ADD COLUMN reference VARCHAR(120) NULL AFTER payment_method;
