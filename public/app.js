// ==========================================
// CONFIGURACIÓN GLOBAL Y DEPURACIÓN
// ==========================================
window.onerror = function(message, source, lineno, colno, error) {
    console.error(`🔴 ERROR FATAL:\nMsg: ${message}\nLínea: ${lineno}`);
    return true; 
};
window.addEventListener("unhandledrejection", function(promiseRejectionEvent) {
    console.warn(`⚠️ PROMESA RECHAZADA:\n${promiseRejectionEvent.reason}`);
});

// Referencias del DOM
const contenedorAcceso = document.getElementById('contenedor-acceso');
const pantallaLogin = document.getElementById('pantalla-login');
const pantallaRegistro = document.getElementById('pantalla-registro');
const pantallaUsuario = document.getElementById('pantalla-usuario');
const pantallaAdmin = document.getElementById('pantalla-admin');

const tabScanner = document.getElementById('tab-scanner');
const tabUsuarios = document.getElementById('tab-usuarios');
const seccionAdminScanner = document.getElementById('seccion-admin-scanner');
const seccionAdminUsuarios = document.getElementById('seccion-admin-usuarios');
const tablaUsuariosCuerpo = document.getElementById('tabla-usuarios-cuerpo');
const badgeTotalUsuarios = document.getElementById('badge-total-usuarios');

const formularioPuntos = document.getElementById('formulario-puntos');
const lectorQrDiv = document.getElementById('lector-qr');

// Variables de Estado
let idUsuarioEscaneado = null; 
let usuarioLogueado = null; 
let escanerActivo = null; 

// ==========================================
// 1. NAVEGACIÓN Y ACCESO
// ==========================================
document.getElementById('link-registro').addEventListener('click', (e) => { 
    e.preventDefault(); 
    pantallaLogin.classList.add('hidden'); 
    pantallaRegistro.classList.remove('hidden'); 
});
document.getElementById('link-login').addEventListener('click', (e) => { 
    e.preventDefault(); 
    pantallaRegistro.classList.add('hidden'); 
    pantallaLogin.classList.remove('hidden'); 
});

// ==========================================
// 2. LÓGICA DE USUARIOS (CAMPISTAS)
// ==========================================
async function cargarSaldoUsuario(username, esAdmin = false) {
    try {
        const res = await fetch(`/api/usuarios/${username}`);
        const data = await res.json();
        if (res.ok) {
            const equivalenciaMxn = (data.puntos * 0.50).toFixed(2); // 1 punto = $0.50
            if (esAdmin) {
                document.getElementById('admin-saldo-usuario').innerText = data.puntos;
                document.getElementById('admin-saldo-mxn').innerText = equivalenciaMxn;
            } else {
                document.getElementById('saldo-usuario').innerText = data.puntos;
                document.getElementById('saldo-mxn').innerText = equivalenciaMxn;
            }
        }
    } catch (error) { console.error("Error al obtener saldo"); }
}

document.getElementById('btn-actualizar-saldo').addEventListener('click', () => {
    if (usuarioLogueado) cargarSaldoUsuario(usuarioLogueado);
});

function generarQRUsuario(username) {
    const qrContenedor = document.getElementById('qr-contenedor');
    qrContenedor.innerHTML = ''; 
    new QRCode(qrContenedor, { 
        text: JSON.stringify({ id_usuario: username }), 
        width: 220, height: 220, 
        colorDark : "#020617", // slate-950
        colorLight : "#ffffff", 
        correctLevel : QRCode.CorrectLevel.H 
    });
}

// ==========================================
// 3. REGISTRO Y LOGIN (AUTH)
// ==========================================
document.getElementById('btn-registrar').addEventListener('click', async () => {
    const telefono = document.getElementById('reg-telefono').value.trim();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    
    if (telefono.length !== 10 || isNaN(telefono)) return alert("Ingresa un número de 10 dígitos.");
    if (nombre === '' || password === '') return alert("Completa todos los campos.");

    const btn = document.getElementById('btn-registrar'); 
    btn.innerText = "Registrando..."; btn.disabled = true;

    try {
        const respuesta = await fetch('/api/registro', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefono, nombre, password })
        });
        const data = await respuesta.json();

        if (data.success) {
            alert("¡Cuenta creada! Ya puedes iniciar sesión.");
            document.getElementById('reg-telefono').value = ''; 
            document.getElementById('reg-nombre').value = ''; 
            document.getElementById('reg-password').value = '';
            document.getElementById('link-login').click(); 
        } else alert(data.error); 
    } catch (error) { alert("Error al conectar."); }
    btn.innerText = "Crear Cuenta"; btn.disabled = false;
});

document.getElementById('btn-entrar').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    if (username === '' || password === '') return alert("Ingresa datos");

    const btn = document.getElementById('btn-entrar'); 
    btn.innerText = "Verificando..."; btn.disabled = true;

    try {
        const respuesta = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await respuesta.json();

        if (data.success) {
            contenedorAcceso.classList.add('hidden'); 
            if (data.usuario.rol === 'admin') {
                pantallaAdmin.classList.remove('hidden');
                iniciarEscanerAdmin();
                cargarUsuariosAdmin(); // Cargar la tabla desde el inicio
            } else {
                usuarioLogueado = data.usuario.username;
                pantallaUsuario.classList.remove('hidden');
                document.getElementById('nombre-usuario').innerText = usuarioLogueado;
                generarQRUsuario(usuarioLogueado);
                cargarSaldoUsuario(usuarioLogueado);
            }
        } else alert(data.error); 
    } catch (error) { alert("Error al conectar."); }
    btn.innerText = "Entrar"; btn.disabled = false;
});

// ==========================================
// 4. MODO ADMINISTRADOR (ESCANER Y FALLBACK)
// ==========================================
tabScanner.addEventListener('click', () => {
    tabScanner.className = "flex-1 text-cyan-400 font-bold border-b-2 border-cyan-400 pb-2 focus:outline-none transition-all"; 
    tabUsuarios.className = "flex-1 text-slate-400 font-bold pb-2 hover:text-cyan-300 focus:outline-none transition-all";
    seccionAdminScanner.classList.remove('hidden'); seccionAdminUsuarios.classList.add('hidden');
    iniciarEscanerAdmin();
});

tabUsuarios.addEventListener('click', async () => {
    tabUsuarios.className = "flex-1 text-cyan-400 font-bold border-b-2 border-cyan-400 pb-2 focus:outline-none transition-all"; 
    tabScanner.className = "flex-1 text-slate-400 font-bold pb-2 hover:text-cyan-300 focus:outline-none transition-all";
    seccionAdminScanner.classList.add('hidden'); seccionAdminUsuarios.classList.remove('hidden');
    
    if (escanerActivo) { 
        await escanerActivo.stop().catch(e=>console.log(e)); 
        escanerActivo = null; 
        lectorQrDiv.classList.remove('hidden'); 
        formularioPuntos.classList.add('hidden'); 
    }
    cargarUsuariosAdmin(); 
});

function iniciarEscanerAdmin() {
    if (escanerActivo) return; 
    
    escanerActivo = new Html5Qrcode("lector-qr");
    escanerActivo.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
        (textoDecodificado) => {
            escanerActivo.stop(); escanerActivo = null; lectorQrDiv.classList.add('hidden'); 
            try {
                const datos = JSON.parse(textoDecodificado);
                if (!datos.id_usuario) throw new Error();
                idUsuarioEscaneado = datos.id_usuario;
                document.getElementById('usuario-detectado').innerText = `Calificando a: ${idUsuarioEscaneado}`;
                document.getElementById('input-canje').value = ''; 
                cargarSaldoUsuario(idUsuarioEscaneado, true); 
                formularioPuntos.classList.remove('hidden');
            } catch (error) {
                alert("QR Inválido."); lectorQrDiv.classList.remove('hidden'); iniciarEscanerAdmin();
            }
        }, () => {}
    ).catch(err => {
        // FALLBACK DE CÁMARA iOS (Degradación Elegante)
        console.warn("Cámara restringida. Activando modo manual fotográfico.");
        
        lectorQrDiv.innerHTML = `
            <div class="p-8 text-center h-full flex flex-col justify-center items-center">
                <div class="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/50">
                    <span class="text-3xl">📷</span>
                </div>
                <p class="text-amber-400 font-bold mb-2 text-lg">Modo Manual Activo</p>
                <p class="text-sm text-slate-400 mb-6">El escáner en vivo está restringido. Utiliza la asignación manual inferior o toma una fotografía al QR.</p>
                
                <label for="qr-foto-input" class="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-300 font-bold py-3 px-6 rounded-xl cursor-pointer shadow-lg transition-all active:scale-95 w-full">
                    📸 Subir / Tomar Foto al QR
                </label>
                <input type="file" id="qr-foto-input" accept="image/*" capture="environment" class="hidden">
            </div>
        `;
        
        // Listener para procesar la foto tomada
        const fotoInput = document.getElementById('qr-foto-input');
        if(fotoInput) {
            fotoInput.addEventListener('change', (e) => {
                if(e.target.files.length === 0) return;
                
                const file = e.target.files[0];
                const tempScanner = new Html5Qrcode("lector-qr"); // Reutilizamos contenedor
                
                tempScanner.scanFile(file, true)
                    .then(textoDecodificado => {
                        try {
                            const datos = JSON.parse(textoDecodificado);
                            if (!datos.id_usuario) throw new Error();
                            
                            idUsuarioEscaneado = datos.id_usuario;
                            document.getElementById('usuario-detectado').innerText = `Calificando a: ${idUsuarioEscaneado}`;
                            document.getElementById('input-canje').value = ''; 
                            cargarSaldoUsuario(idUsuarioEscaneado, true); 
                            
                            formularioPuntos.classList.remove('hidden');
                            lectorQrDiv.classList.add('hidden');
                        } catch (error) {
                            alert("⚠️ El QR de la imagen no es válido para JC App.");
                        }
                    })
                    .catch(err => {
                        alert("❌ No se detectó ningún QR claro en la foto. Intenta acercarte más o usa la Asignación Manual.");
                    });
            });
        }
        cargarUsuariosAdmin();
    });
}

// ==========================================
// 5. OPERACIONES DE STAFF (TRANSACCIONES)
// ==========================================
async function enviarTransaccion(puntos, concepto, btnId) {
    let targetUser = idUsuarioEscaneado;
    
    // CORRECCIÓN: Si es captura manual pura sin escanear previamente
    if(btnId === 'btn-manual-puntos' && !targetUser) {
        targetUser = prompt("Ingresa el número de teléfono (10 dígitos) del campista:");
        if(!targetUser || targetUser.length !== 10) return alert("Número inválido. Operación cancelada.");
    } else if (!targetUser) {
        return alert("⚠️ Primero escanea un usuario o ingresa su número.");
    }

    const btn = document.getElementById(btnId);
    const textoOriginal = btn.innerText;
    btn.innerText = "Procesando..."; btn.disabled = true;

    try {
        const respuesta = await fetch('/api/transacciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: targetUser, puntos: puntos, concepto: concepto })
        });
        const data = await respuesta.json();

        if (respuesta.ok) {
            alert(data.mensaje);
        } else {
            alert("Error: " + data.error); 
        }
    } catch (error) { alert("Error de red local."); }

    btn.innerText = textoOriginal; btn.disabled = false;
    
    if(formularioPuntos && !formularioPuntos.classList.contains('hidden')) {
        formularioPuntos.classList.add('hidden'); 
        lectorQrDiv.classList.remove('hidden');
        document.querySelectorAll('#formulario-puntos input[type="checkbox"]').forEach(chk => chk.checked = false);
        iniciarEscanerAdmin();
    }
    cargarUsuariosAdmin(); 
}

// Sumar Recompensas Predefinidas
document.getElementById('btn-guardar-puntos').addEventListener('click', () => {
    let puntosTotales = 0;
    document.querySelectorAll('#formulario-puntos input[type="checkbox"]:checked').forEach(chk => puntosTotales += parseInt(chk.value));
    if (puntosTotales === 0) return alert("Selecciona al menos una recompensa.");
    enviarTransaccion(puntosTotales, 'Ganancia por Asistencia', 'btn-guardar-puntos');
});

// Descontar por Churranga
document.getElementById('btn-canjear-puntos').addEventListener('click', () => {
    const puntosDescontar = parseInt(document.getElementById('input-canje').value);
    if (isNaN(puntosDescontar) || puntosDescontar <= 0) return alert("Ingresa una cantidad válida a descontar.");
    enviarTransaccion(-Math.abs(puntosDescontar), 'Canje en Tienda', 'btn-canjear-puntos');
});

// Puntos Manuales
const btnManualPuntos = document.getElementById('btn-manual-puntos');
if(btnManualPuntos) {
    btnManualPuntos.addEventListener('click', () => {
        const puntosExtra = parseInt(document.getElementById('input-puntos-manual').value);
        const conceptoExtra = document.getElementById('input-concepto-manual').value.trim();

        if (isNaN(puntosExtra) || puntosExtra === 0) return alert("⚠️ Ingresa una cantidad válida de puntos.");
        if (!conceptoExtra) return alert("⚠️ Ingresa un motivo para la transacción.");

        enviarTransaccion(puntosExtra, conceptoExtra, 'btn-manual-puntos');
        
        document.getElementById('input-puntos-manual').value = '';
        document.getElementById('input-concepto-manual').value = '';
    });
}

// ==========================================
// 6. LISTA DE USUARIOS (TABLA ADMIN)
// ==========================================
async function cargarUsuariosAdmin() {
    try {
        const res = await fetch('/api/usuarios'); const usuarios = await res.json();
        badgeTotalUsuarios.innerText = `${usuarios.length} Usuarios`; 
        tablaUsuariosCuerpo.innerHTML = '';
        
        usuarios.forEach(usr => {
            // UI REDISEÑADA: Liquid Glass Theme inyectado dinámicamente
            tablaUsuariosCuerpo.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td class="px-4 py-4">
                        <div class="font-bold text-white">${usr.nombre_completo}</div>
                        <div class="text-xs text-slate-400">${usr.username}</div>
                        <div class="mt-1">
                            <span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-2 py-0.5 rounded shadow-sm">
                                ${usr.puntos_totales} pts ($${(usr.puntos_totales*0.5).toFixed(2)})
                            </span>
                        </div>
                    </td>
                    <td class="px-4 py-4 text-center">
                        <button onclick="resetearPassword('${usr.username}')" class="bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 font-bold py-1.5 px-3 rounded-lg border border-rose-500/30 transition-colors shadow-sm">
                            Reset
                        </button>
                    </td>
                </tr>`;
        });
    } catch (e) { console.error("Error cargando tabla de usuarios"); }
}

async function resetearPassword(username) {
    if (!confirm(`¿Resetear la clave de ${username} a '1234'?`)) return;
    try {
        const res = await fetch('/api/usuarios/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
        if (res.ok) { alert("Clave reestablecida a: 1234"); cargarUsuariosAdmin(); }
    } catch (e) { alert("Error de red local."); }
}

// ==========================================
// 7. UX: BOTONES MOSTRAR CONTRASEÑA (Refactorizado)
// ==========================================
function setupPasswordToggle(toggleId, inputId) {
    const toggleBtn = document.getElementById(toggleId);
    const passInput = document.getElementById(inputId);
    if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', function () {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            this.textContent = type === 'password' ? '👁️' : '🙈';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupPasswordToggle('toggle-login-password', 'login-password');
    setupPasswordToggle('toggle-reg-password', 'reg-password');
});