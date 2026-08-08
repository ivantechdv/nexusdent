import rateLimit from 'express-rate-limit';

/** Límite general por IP */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas peticiones. Intente de nuevo en un minuto.' },
});

/** Login: anti fuerza bruta */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Demasiados intentos de acceso. Espere 15 minutos.',
  },
});

/** Escrituras sensibles (visitas / pagos) */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas operaciones. Espere un momento.' },
});
