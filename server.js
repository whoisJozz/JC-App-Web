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

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect((err) => {
    if (err) return console.error('Error conectando a PostgreSQL ❌:', err.message);
    console.log('¡Conexión a BD Exitosa! 🚀');
});

// 1. REGISTRO
app.post('/api/registro', async (req, res) => {
    const { telefono, nombre, password } = req.body;
    try {
        const existe = await pool.query('SELECT id FROM usuarios WHERE username = $1', [telefono]);
        if (existe.rows.length > 0) return res.status(400).json({ success: false, error: "Teléfono ya registrado." });
        const newUser = await pool.query('INSERT INTO usuarios (username, nombre_completo, rol, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, rol', [telefono, nombre, 'usuario', password]);
        res.status(201).json({ success: true, usuario: newUser.rows[0] });
    } catch (err) { res.status(500).json({ error: "Error del servidor." }); }
});

// 2. LOGIN
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

// 3. CONSULTAR SALDO INDIVIDUAL
app.get('/api/usuarios/:username', async (req, res) => {
    try {
        const result = await pool.query('SELECT puntos_totales FROM usuarios WHERE username = $1', [req.params.username]);
        if (result.rows.length === 0) return res.status(404).json({ error: "No encontrado" });
        res.json({ puntos: result.rows[0].puntos_totales });
    } catch (err) { res.status(500).json({ error: "Error del servidor" }); }
});

// 4. TRANSACCIONES (Sumar o Canjear)
app.post('/api/transacciones', async (req, res) => {
    const { username, puntos, concepto } = req.body;
    try {
        const userResult = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
        if (userResult.rows.length === 0) return res.status(404).json({ error: "Usuario no existe." });

        await pool.query(
            'INSERT INTO transacciones (usuario_id, concepto, cantidad_puntos) VALUES ($1, $2, $3)',
            [userResult.rows[0].id, concepto, puntos]
        );
        
        const accion = puntos > 0 ? "sumados" : "descontados";
        res.status(201).json({ mensaje: `${Math.abs(puntos)} puntos ${accion} correctamente.` });
    } catch (err) {
        // Atrapamos la protección CHECK (puntos_totales >= 0) de la BD
        if (err.message.includes('violates check constraint')) {
            return res.status(400).json({ error: "Saldo insuficiente para realizar este canje." });
        }
        res.status(500).json({ error: err.message });
    }
});

// 5. LISTADO DE ADMIN
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query("SELECT username, nombre_completo, puntos_totales FROM usuarios WHERE rol = 'usuario' ORDER BY puntos_totales DESC");
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Error de servidor." }); }
});

// 6. RESET PASSWORD
app.post('/api/usuarios/reset-password', async (req, res) => {
    try {
        await pool.query("UPDATE usuarios SET password_hash = $1 WHERE username = $2 AND rol = 'usuario'", ['1234', req.body.username]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Error." }); }
});

app.listen(PORT, '0.0.0.0', () => { console.log(`Servidor de JC App corriendo en http://localhost:${PORT}`); });