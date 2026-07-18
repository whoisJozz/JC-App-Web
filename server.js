require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg'); 
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT_HTTP = 3000;
const PORT_HTTPS = 3443;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de Base de Datos con reconexión automática
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect((err) => {
    if (err) {
        console.error('⚠️ Advertencia: Conexión inicial a PostgreSQL fallida. Se reintentará en cada consulta:', err.message);
    } else {
        console.log('✅ ¡Conexión inicial a BD Exitosa!');
    }
});

// Endpoints funcionales para tu frontend preferido
app.post('/api/registro', async (req, res) => {
    const { telefono, nombre, password } = req.body;
    try {
        const existe = await pool.query('SELECT id FROM usuarios WHERE username = $1', [telefono]);
        if (existe.rows.length > 0) return res.status(400).json({ success: false, error: "Teléfono ya registrado." });
        const newUser = await pool.query('INSERT INTO usuarios (username, nombre_completo, rol, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, rol', [telefono, nombre, 'usuario', password]);
        res.status(201).json({ success: true, usuario: newUser.rows[0] });
    } catch (err) { res.status(500).json({ error: "Error del servidor." }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userResult = await pool.query('SELECT id, username, rol, password_hash FROM usuarios WHERE username = $1', [username]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: "Usuario no encontrado." });
        if (password === userResult.rows[0].password_hash) {
            return res.json({ success: true, usuario: { id: userResult.rows[0].id, username: userResult.rows[0].username, rol: userResult.rows[0].rol } });
        } else return res.status(401).json({ success: false, error: "Contraseña incorrecta." });
    } catch (err) { res.status(500).json({ error: "Error del servidor." }); }
});

app.get('/api/usuarios/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT puntos_totales FROM usuarios WHERE username = $1', [req.params.username]);
        if (result.rows.length === 0) return res.status(404).json({ error: "No encontrado" });
        res.json({ puntos: result.rows[0].puntos_totales });
    } catch (err) { res.status(500).json({ error: "Error del servidor" }); }
});

app.post('/api/transacciones', async (req, res) => {
    const { username, puntos, concepto } = req.body;
    try {
        const userResult = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: "Usuario no existe." });

        await pool.query(
            'INSERT INTO transacciones (usuario_id, concepto, cantidad_puntos) VALUES ($1, $2, $3)',
            [userResult.rows[0].id, concepto, puntos]
        );
        res.status(201).json({ mensaje: `${Math.abs(puntos)} puntos procesados correctamente.` });
    } catch (err) {
        if (err.message.includes('violates check constraint')) {
            return res.status(400).json({ error: "Saldo insuficiente para esta operación." });
        }
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query("SELECT username, nombre_completo, puntos_totales FROM usuarios WHERE rol = 'usuario' ORDER BY puntos_totales DESC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Error de servidor." }); }
});

app.post('/api/usuarios/reset-password', async (req, res) => {
    try {
        await pool.query("UPDATE usuarios SET password_hash = $1 WHERE username = $2 AND rol = 'usuario'", ['1234', req.body.username]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Error." }); }
});

// ========================================================
//  LEVANTAMIENTO SIMULTÁNEO DE PUERTOS (HTTP & HTTPS)
// ========================================================

// Puerta 1: HTTP estándar para visualización y consultas comunes (Puerto 3000)
http.createServer(app).listen(PORT_HTTP, '0.0.0.0', () => { 
    console.log(`🌐 Servidor HTTP corriendo en http://0.0.0.0:${PORT_HTTP}`); 
});

// Puerta 2: HTTPS encriptado para habilitar hardware de cámara nativa (Puerto 3443)
try {
    const opcionesSSL = {
        key: fs.readFileSync(path.join(__dirname, 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'server.cert'))
    };

    https.createServer(opcionesSSL, app).listen(PORT_HTTPS, '0.0.0.0', () => { 
        console.log(` Servidor HTTPS (Entorno Seguro) corriendo en el puerto ${PORT_HTTPS}`); 
    });
} catch (error) {
    console.error(" Error crítico al cargar llaves SSL en server.js:", error.message);
}