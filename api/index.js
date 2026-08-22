'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Las rutas absolutas evitan depender del directorio desde el que Vercel o Node inicien el proceso.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { randomInt } = require('crypto');
const { Pool } = require('pg');
const xss = require('xss');

const app = express();
const JWT_COOKIE = 'jc_session';
const JWT_EXPIRES_IN = '12h';
const JWT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const MAX_TRANSACTION_POINTS = 10000;
const appOrigin = process.env.ALLOWED_ORIGIN;
const isVercelDeployment = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
let databaseConfigurationError = !process.env.DATABASE_URL
    ? 'DATABASE_URL no está configurada.'
    : null;
const jwtConfigurationError = !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32
    ? 'JWT_SECRET no está configurado correctamente.'
    : null;

// No se crea el Pool sin URL: así el módulo siempre carga y la API responde JSON aun con
// configuración incompleta. Vercel reutiliza este Pool entre invocaciones calientes.
let pool = null;
if (!databaseConfigurationError) {
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: isVercelDeployment ? { rejectUnauthorized: true } : false,
            max: 1,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 5000
        });
        pool.on('error', (error) => console.error('Error inesperado del Pool de PostgreSQL:', error));
    } catch (error) {
        console.error('DATABASE_URL inválida:', error.message);
        databaseConfigurationError = 'DATABASE_URL no tiene un formato válido.';
        pool = null;
    }
}

const cookieOptions = Object.freeze({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: JWT_MAX_AGE_MS
});

const corsOptions = {
    origin(origin, callback) {
        // Las llamadas same-origin y herramientas sin cabecera Origin no necesitan CORS.
        if (!origin) return callback(null, true);
        if (appOrigin && origin === appOrigin) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type']
};

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(cookieParser());

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }
});

const transactionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de transacciones alcanzado. Intenta de nuevo más tarde.' }
});

app.use('/api', generalLimiter);
app.use('/api', (req, res, next) => {
    res.type('application/json');
    next();
});

function sanitizedText(value, field, maxLength, { required = true } = {}) {
    if (typeof value !== 'string') {
        throw new ValidationError(`${field} no es válido.`);
    }

    const cleaned = xss(value, {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style']
    }).trim();

    if ((required && !cleaned) || cleaned.length > maxLength) {
        throw new ValidationError(`${field} no es válido.`);
    }

    return cleaned;
}

function passwordValue(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
        throw new ValidationError('La contraseña debe tener entre 8 y 128 caracteres.');
    }

    return value;
}

function usernameValue(value) {
    const username = sanitizedText(value, 'Usuario', 50).toLowerCase();
    if (!/^(?:\d{10}|[a-z0-9_]{3,50})$/.test(username)) {
        throw new ValidationError('Usuario no válido.');
    }

    return username;
}

function phoneValue(value) {
    const phone = sanitizedText(value, 'Teléfono', 10);
    if (!/^\d{10}$/.test(phone)) {
        throw new ValidationError('Ingresa un teléfono de 10 dígitos.');
    }

    return phone;
}

function integerPoints(value) {
    const points = Number(value);
    if (!Number.isSafeInteger(points) || points === 0 || Math.abs(points) > MAX_TRANSACTION_POINTS) {
        throw new ValidationError(`Los puntos deben ser un entero distinto de cero y no mayor a ${MAX_TRANSACTION_POINTS}.`);
    }

    return points;
}

function resourceId(value, field = 'Identificador') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ValidationError(`${field} no es válido.`);
    }

    return id;
}

function eventDateValue(value) {
    const rawDate = sanitizedText(value, 'Fecha', 50);
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
        throw new ValidationError('Fecha no válida.');
    }

    return date.toISOString();
}

function activeValue(value) {
    if (typeof value !== 'boolean') {
        throw new ValidationError('El estado del evento no es válido.');
    }

    return value;
}

function sendConfigurationError(res, message) {
    return res.status(500).json({
        error: 'SERVER_CONFIGURATION_ERROR',
        message
    });
}

function requireDatabase(req, res, next) {
    if (databaseConfigurationError || !pool) {
        return sendConfigurationError(res, databaseConfigurationError || 'La base de datos no está disponible.');
    }

    return next();
}

function requireJwtConfiguration(req, res, next) {
    if (jwtConfigurationError) {
        return sendConfigurationError(res, jwtConfigurationError);
    }

    return next();
}

function signUser(user) {
    return jwt.sign(
        { username: user.username, rol: user.rol },
        process.env.JWT_SECRET,
        { subject: String(user.id), expiresIn: JWT_EXPIRES_IN, issuer: 'jc-app', audience: 'jc-app-web' }
    );
}

function setSession(res, user) {
    res.cookie(JWT_COOKIE, signUser(user), cookieOptions);
}

function clearSession(res) {
    const { maxAge, ...clearCookieOptions } = cookieOptions;
    res.clearCookie(JWT_COOKIE, clearCookieOptions);
}

function requireAuth(req, res, next) {
    if (jwtConfigurationError) {
        return sendConfigurationError(res, jwtConfigurationError);
    }

    const token = req.cookies[JWT_COOKIE];
    if (!token) {
        return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Tu sesión expiró. Inicia sesión nuevamente.' });
    }

    try {
        req.auth = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'jc-app',
            audience: 'jc-app-web'
        });
        return next();
    } catch {
        clearSession(res);
        return res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Tu sesión expiró. Inicia sesión nuevamente.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.auth.rol !== 'admin') {
        return res.status(403).json({ error: 'No tienes permiso para esta operación.' });
    }

    return next();
}

function requireSameOrigin(req, res, next) {
    const origin = req.get('origin');
    if (origin && (!appOrigin || origin !== appOrigin)) {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    return next();
}

class ValidationError extends Error {}

function isConstraintViolation(error) {
    return error && error.code === '23514';
}

function isUniqueViolation(error) {
    return error && error.code === '23505';
}

function parseCsv(csvText) {
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
        const character = csvText[index];
        const nextCharacter = csvText[index + 1];

        if (character === '"' && inQuotes && nextCharacter === '"') {
            value += '"';
            index += 1;
        } else if (character === '"') {
            inQuotes = !inQuotes;
        } else if (character === ',' && !inQuotes) {
            row.push(value);
            value = '';
        } else if ((character === '\n' || character === '\r') && !inQuotes) {
            if (character === '\r' && nextCharacter === '\n') index += 1;
            row.push(value);
            if (row.some((cell) => cell.trim())) rows.push(row);
            row = [];
            value = '';
        } else {
            value += character;
        }
    }

    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
    return rows;
}

function getVersesUrl() {
    if (!process.env.VERSES_CSV_URL) return null;

    const url = new URL(process.env.VERSES_CSV_URL);
    const isGoogleHost = url.protocol === 'https:' && (
        url.hostname === 'docs.google.com' || url.hostname === 'docs.googleusercontent.com'
    );

    if (!isGoogleHost) {
        throw new Error('VERSES_CSV_URL debe ser una URL HTTPS publicada de Google Sheets.');
    }

    return url.toString();
}

let versesCache = { expiresAt: 0, verses: [] };

async function loadVerses() {
    const now = Date.now();
    if (versesCache.expiresAt > now && versesCache.verses.length) {
        return versesCache.verses;
    }

    const versesUrl = getVersesUrl();
    if (!versesUrl) return [];

    const response = await fetch(versesUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'text/csv' }
    });

    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}.`);

    const rows = parseCsv(await response.text());
    const headers = rows.shift() || [];
    const verseColumn = headers.findIndex((header) => header.replace(/^\uFEFF/, '').trim().toLowerCase() === 'versiculo');
    if (verseColumn === -1) throw new Error('El CSV no contiene la columna Versiculo.');

    const verses = rows
        .map((row) => row[verseColumn] && row[verseColumn].trim())
        .filter(Boolean)
        .map((verse) => sanitizedText(verse, 'Versículo', 1000));

    versesCache = { expiresAt: now + 5 * 60 * 1000, verses };
    return verses;
}

app.post('/api/registro', authLimiter, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const username = phoneValue(req.body.telefono);
        const nombre = sanitizedText(req.body.nombre, 'Nombre', 100);
        const passwordHash = await bcrypt.hash(passwordValue(req.body.password), BCRYPT_ROUNDS);
        const result = await pool.query(
            `INSERT INTO usuarios (username, nombre_completo, rol, password_hash)
             VALUES ($1, $2, 'usuario', $3)
             ON CONFLICT (username) DO NOTHING
             RETURNING id, username, rol`,
            [username, nombre, passwordHash]
        );

        if (!result.rows.length) {
            return res.status(400).json({ success: false, error: 'Teléfono ya registrado.' });
        }

        return res.status(201).json({ success: true, usuario: result.rows[0] });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/login', authLimiter, requireSameOrigin, requireDatabase, requireJwtConfiguration, async (req, res, next) => {
    try {
        const username = usernameValue(req.body.username);
        const password = passwordValue(req.body.password);
        const result = await pool.query(
            'SELECT id, username, rol, password_hash FROM usuarios WHERE username = $1',
            [username]
        );
        const user = result.rows[0];

        // Un único mensaje evita enumerar las cuentas existentes.
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
        }

        setSession(res, user);
        return res.json({
            success: true,
            usuario: { id: user.id, username: user.username, rol: user.rol }
        });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/logout', requireAuth, requireSameOrigin, (req, res) => {
    clearSession(res);
    return res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    return res.json({ usuario: { id: Number(req.auth.sub), username: req.auth.username, rol: req.auth.rol } });
});

app.get('/api/usuarios', requireAuth, requireAdmin, requireDatabase, async (req, res, next) => {
    try {
        const result = await pool.query(
            "SELECT id, username, nombre_completo, puntos_totales FROM usuarios WHERE rol = 'usuario' ORDER BY puntos_totales DESC, username ASC"
        );
        return res.json(result.rows);
    } catch (error) {
        return next(error);
    }
});

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const id = resourceId(req.params.id, 'ID de usuario');
        const result = await pool.query(
            "DELETE FROM usuarios WHERE id = $1 AND rol = 'usuario' RETURNING id, username",
            [id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });

        return res.json({ success: true, mensaje: 'Usuario eliminado correctamente.' });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/usuarios/:username', requireAuth, requireDatabase, async (req, res, next) => {
    try {
        const username = usernameValue(req.params.username);
        if (req.auth.rol !== 'admin' && req.auth.username !== username) {
            return res.status(403).json({ error: 'No tienes permiso para consultar este saldo.' });
        }

        const result = await pool.query('SELECT puntos_totales FROM usuarios WHERE username = $1', [username]);
        if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });

        return res.json({ puntos: result.rows[0].puntos_totales });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/transacciones', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, transactionLimiter, async (req, res, next) => {
    try {
        const username = usernameValue(req.body.username);
        const points = integerPoints(req.body.puntos);
        const concept = sanitizedText(req.body.concepto, 'Concepto', 255);
        const userResult = await pool.query('SELECT id FROM usuarios WHERE username = $1 AND rol = $2', [username, 'usuario']);
        if (!userResult.rows.length) return res.status(404).json({ error: 'Usuario no existe.' });

        await pool.query(
            'INSERT INTO transacciones (usuario_id, concepto, cantidad_puntos) VALUES ($1, $2, $3)',
            [userResult.rows[0].id, concept, points]
        );

        return res.status(201).json({ mensaje: `${Math.abs(points)} puntos procesados correctamente.` });
    } catch (error) {
        if (isConstraintViolation(error)) {
            return res.status(400).json({ error: 'Saldo insuficiente para esta operación.' });
        }
        return next(error);
    }
});

app.post('/api/usuarios/reset-password', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const username = usernameValue(req.body.username);
        const newPassword = passwordValue(req.body.newPassword);
        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        const result = await pool.query(
            "UPDATE usuarios SET password_hash = $1 WHERE username = $2 AND rol = 'usuario' RETURNING username",
            [passwordHash, username]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });

        return res.json({ success: true });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/eventos', requireDatabase, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, titulo, fecha FROM eventos WHERE activo = TRUE ORDER BY fecha ASC, id ASC'
        );
        return res.json({ eventos: result.rows });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/eventos/admin', requireAuth, requireAdmin, requireDatabase, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, titulo, fecha, activo FROM eventos ORDER BY fecha ASC, id ASC'
        );
        return res.json({ eventos: result.rows });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/eventos', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const title = sanitizedText(req.body.titulo, 'Título', 100);
        const date = eventDateValue(req.body.fecha);
        const result = await pool.query(
            'INSERT INTO eventos (titulo, fecha) VALUES ($1, $2) RETURNING id, titulo, fecha, activo',
            [title, date]
        );
        return res.status(201).json({ success: true, evento: result.rows[0] });
    } catch (error) {
        return next(error);
    }
});

app.put('/api/eventos/:id', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const id = resourceId(req.params.id, 'ID de evento');
        const title = sanitizedText(req.body.titulo, 'Título', 100);
        const date = eventDateValue(req.body.fecha);
        const result = await pool.query(
            'UPDATE eventos SET titulo = $1, fecha = $2 WHERE id = $3 RETURNING id, titulo, fecha, activo',
            [title, date, id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Evento no encontrado.' });

        return res.json({ success: true, evento: result.rows[0] });
    } catch (error) {
        return next(error);
    }
});

app.patch('/api/eventos/:id/estado', requireAuth, requireAdmin, requireSameOrigin, requireDatabase, async (req, res, next) => {
    try {
        const id = resourceId(req.params.id, 'ID de evento');
        const active = activeValue(req.body.activo);
        const result = await pool.query(
            'UPDATE eventos SET activo = $1 WHERE id = $2 RETURNING id, titulo, fecha, activo',
            [active, id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Evento no encontrado.' });

        return res.json({ success: true, evento: result.rows[0] });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/versiculos', async (req, res, next) => {
    try {
        const verses = await loadVerses();
        if (!verses.length) return res.status(404).json({ error: 'No hay versículos disponibles.' });

        // La caché solo conserva el CSV; la selección usa entropía nueva en cada petición.
        const verse = verses[randomInt(verses.length)];
        return res.json({ versiculo: verse });
    } catch (error) {
        return next(error);
    }
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
    }

    if (isUniqueViolation(error)) {
        return res.status(400).json({ success: false, error: 'Teléfono ya registrado.' });
    }

    if (error && error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
    }

    if (error && error.message === 'Origen no permitido por CORS.') {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    console.error('API error:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
