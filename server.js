'use strict';

const path = require('path');
// Adaptador robusto para cargar .env.local prioritariamente y de forma absoluta
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const api = require('./api');

const app = express();
// Cambiamos los puertos por defecto a 3001 y 3444 para evitar el error EADDRINUSE
const HTTP_PORT = Number(process.env.PORT_HTTP || 3001);
const HTTPS_PORT = Number(process.env.PORT_HTTPS || 3444);

app.use(express.static(path.join(__dirname, 'public')));
app.use(api);

http.createServer(app).listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`✅ Vista local HTTP: http://localhost:${HTTP_PORT}`);
    console.log('⚠️ Usa HTTPS para iniciar sesión porque la cookie de sesión es Secure.');
}).on('error', (err) => {
    console.error(`❌ Error en puerto HTTP ${HTTP_PORT}:`, err.message);
});

try {
    const httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'server.cert'))
    };

    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🔒 JC App local: https://localhost:${HTTPS_PORT}`);
    }).on('error', (err) => {
        console.error(`❌ Error en puerto HTTPS ${HTTPS_PORT} (probablemente en uso):`, err.message);
    });
} catch (error) {
    console.warn('⚠️ No se inició HTTPS local (faltan certificados):', error.message);
}