
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    rol VARCHAR(20) DEFAULT 'usuario',
    puntos_totales INT DEFAULT 0 CHECK (puntos_totales >= 0)
);

-- bcrypt para las credenciales existentes y las cuentas semilla.
-- Esta migración es idempotente: solo convierte valores que no son hashes bcrypt.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE usuarios
SET password_hash = crypt(password_hash, gen_salt('bf', 12))
WHERE password_hash NOT LIKE '$2%';

-- 2. Crear tabla de transacciones si no existe
CREATE TABLE IF NOT EXISTS transacciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    concepto VARCHAR(255) NOT NULL,
    cantidad_puntos INT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Eventos administrables desde el panel web.
CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(100) NOT NULL,
    fecha TIMESTAMPTZ NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_eventos_activo_fecha
ON eventos (activo, fecha);

-- 4. Insertar a los Administradores (General y Staff Dividido).
-- Cambia estas contraseñas iniciales inmediatamente después del primer despliegue.
INSERT INTO usuarios (username, password_hash, nombre_completo, rol, puntos_totales)
VALUES 
    ('admin_general', crypt('ElOzO2004', gen_salt('bf', 12)), 'Administrador Principal', 'admin', 0),
    ('admin_hombres', crypt('soyadmin_hombre', gen_salt('bf', 12)), 'Admin Staffsito Hombres', 'admin', 0),
    ('admin_mujeres', crypt('soyadmin_mujer', gen_salt('bf', 12)), 'Admin Staffsita Mujeres', 'admin', 0)
ON CONFLICT (username) DO NOTHING;

-- 5. Crear la función del Trigger para actualizar puntos y saldos en tiempo real
CREATE OR REPLACE FUNCTION actualizar_puntos()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE usuarios
    SET puntos_totales = (
        SELECT COALESCE(SUM(cantidad_puntos), 0)
        FROM transacciones
        WHERE usuario_id = NEW.usuario_id
    )
    WHERE id = NEW.usuario_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Vincular el Trigger a la tabla de transacciones
DROP TRIGGER IF EXISTS trigger_actualizar_puntos ON transacciones;
CREATE TRIGGER trigger_actualizar_puntos
AFTER INSERT ON transacciones
FOR EACH ROW
EXECUTE FUNCTION actualizar_puntos();
