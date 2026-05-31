require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg'); 

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de BD y Diagnóstico Inicial de Variables de Entorno
console.log("🔍 DIAGNÓSTICO DE VARIABLES:");
console.log("Usuario:", process.env.DB_USER);
console.log("Host:", process.env.DB_HOST);
console.log("Base de datos:", process.env.DB_NAME);

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect((err, client, release) => {
    if (err) return console.error('Error conectando a PostgreSQL ❌:', err.message);
    console.log('¡Conexión exitosa a la base de datos PostgreSQL! 🚀');
    release();
});

// ==========================================
// ENRUTAMIENTO Y LOGICA REST
// ==========================================

// 1. Login Inteligente (Fricción cero para usuarios / Validación estricta para admins)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userResult = await pool.query('SELECT id, username, rol, password_hash FROM usuarios WHERE username = $1', [username]);

        if (userResult.rows.length === 0) {
            // Alta automática si el usuario regular no existe en el sistema
            const newUser = await pool.query(
                'INSERT INTO usuarios (username, nombre_completo, rol, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, rol',
                [username, username, 'usuario', '']
            );
            return res.json({ success: true, usuario: newUser.rows[0] });
        }

        const usuario = userResult.rows[0];

        if (usuario.rol === 'admin') {
            if (password === usuario.password_hash) {
                return res.json({ success: true, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
            } else {
                return res.status(401).json({ success: false, error: "Contraseña de administrador incorrecta." });
            }
        } else {
            return res.json({ success: true, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
        }

    } catch (err) {
        console.error("Error crítico en login:", err);
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// 2. Transacciones (Captura automática de puntos mediante trigger)
app.post('/api/transacciones', async (req, res) => {
    const { username, puntos } = req.body;
    try {
        const userResult = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        let usuarioId;

        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                'INSERT INTO usuarios (username, nombre_completo, password_hash) VALUES ($1, $2, $3) RETURNING id',
                [username, username, ''] 
            );
            usuarioId = newUser.rows[0].id;
        } else {
            usuarioId = userResult.rows[0].id;
        }

        await pool.query(
            'INSERT INTO transacciones (usuario_id, concepto, cantidad_puntos) VALUES ($1, $2, $3)',
            [usuarioId, 'Escaneo QR (Admin)', puntos]
        );
        res.status(201).json({ mensaje: "Transacción e inserción completada exitosamente." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de JC App corriendo en http://localhost:${PORT}`);
});