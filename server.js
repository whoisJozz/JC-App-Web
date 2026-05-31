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

// ==========================================
// CONFIGURACIÓN DE BD Y DIAGNÓSTICO
// ==========================================
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
// RUTAS API REST
// ==========================================

// 1. LOGIN INTELIGENTE Y SEGURO
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Buscamos si el usuario existe
        const userResult = await pool.query('SELECT id, username, rol, password_hash FROM usuarios WHERE username = $1', [username]);

        // Si no existe, lo creamos como usuario normal (fricción cero)
        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                'INSERT INTO usuarios (username, nombre_completo, rol, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, rol',
                [username, username, 'usuario', '']
            );
            return res.json({ success: true, usuario: newUser.rows[0] });
        }

        const usuario = userResult.rows[0];

        // Si es admin, exigimos la contraseña
        if (usuario.rol === 'admin') {
            if (password === usuario.password_hash) {
                return res.json({ success: true, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
            } else {
                return res.status(401).json({ success: false, error: "Contraseña de administrador incorrecta." });
            }
        } else {
            // Usuario normal existente pasa directo
            return res.json({ success: true, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
        }

    } catch (err) {
        console.error("Error crítico en el servidor durante login:", err);
        res.status(500).json({ error: "Error interno del servidor. Revisa los logs de Docker." });
    }
});

// 2. GUARDAR PUNTOS Y TRANSACCIONES
app.post('/api/transacciones', async (req, res) => {
    const { username, puntos } = req.body;
    try {
        const userResult = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        let usuarioId;

        if (userResult.rows.length === 0) {
            const newUser = await pool.query(
                'INSERT INTO usuarios (username, nombre_completo, password_hash) VALUES ($1, $2, $3) RETURNING id',
                [username, username, '1234'] 
            );
            usuarioId = newUser.rows[0].id;
        } else {
            usuarioId = userResult.rows[0].id;
        }

        await pool.query(
            'INSERT INTO transacciones (usuario_id, concepto, cantidad_puntos) VALUES ($1, $2, $3)',
            [usuarioId, 'Escaneo QR (Admin)', puntos]
        );
        res.status(201).json({ mensaje: "Puntos guardados" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de JC App corriendo en http://localhost:${PORT}`);
});