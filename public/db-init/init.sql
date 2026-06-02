-- ==========================================
-- ARCHIVO DE AUTO-SEMBRADO DE LA BASE DE DATOS
-- ==========================================

-- 1. Crear tabla de usuarios si no existe
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    rol VARCHAR(20) DEFAULT 'usuario',
    puntos_totales INT DEFAULT 0 CHECK (puntos_totales >= 0)
);

-- 2. Crear tabla de transacciones si no existe
CREATE TABLE IF NOT EXISTS transacciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    concepto VARCHAR(255) NOT NULL,
    cantidad_puntos INT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Insertar al Administrador Principal por defecto (Evita duplicados con ON CONFLICT)
INSERT INTO usuarios (username, password_hash, nombre_completo, rol, puntos_totales)
VALUES ('admin_general', '12345', 'Administrador Principal', 'admin', 0)
ON CONFLICT (username) DO NOTHING;

-- 4. Crear la función del Trigger para actualizar puntos y saldos en tiempo real
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

-- 5. Vincular el Trigger a la tabla de transacciones
DROP TRIGGER IF EXISTS trigger_actualizar_puntos ON transacciones;
CREATE TRIGGER trigger_actualizar_puntos
AFTER INSERT ON transacciones
FOR EACH ROW
EXECUTE FUNCTION actualizar_puntos();