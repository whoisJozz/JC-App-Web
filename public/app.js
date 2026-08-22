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
let eventoEditandoId = null;

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
    cargarEventosAdmin();
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
        if (!res.ok) throw new Error(usuarios.error || 'No fue posible cargar los usuarios.');
        badgeTotalUsuarios.innerText = `${usuarios.length} Usuarios`; 
        tablaUsuariosCuerpo.innerHTML = '';
        
        usuarios.forEach(usr => {
            // Se construye con textContent para no interpretar datos de usuarios como HTML.
            const row = document.createElement('tr');
            row.className = 'border-b border-white/5 hover:bg-white/5 transition-colors';
            const infoCell = document.createElement('td');
            infoCell.className = 'px-4 py-4';

            const nombre = document.createElement('div');
            nombre.className = 'font-bold text-white';
            nombre.textContent = usr.nombre_completo;
            const username = document.createElement('div');
            username.className = 'text-xs text-slate-400';
            username.textContent = usr.username;
            const pointsWrap = document.createElement('div');
            pointsWrap.className = 'mt-1';
            const points = document.createElement('span');
            points.className = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-2 py-0.5 rounded shadow-sm';
            points.textContent = `${usr.puntos_totales} pts ($${(usr.puntos_totales * 0.5).toFixed(2)})`;
            pointsWrap.append(points);
            infoCell.append(nombre, username, pointsWrap);

            const actionCell = document.createElement('td');
            actionCell.className = 'px-4 py-4 text-center';
            const actions = document.createElement('div');
            actions.className = 'flex flex-col gap-2 items-center';
            const resetButton = document.createElement('button');
            resetButton.type = 'button';
            resetButton.className = 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 font-bold py-1.5 px-3 rounded-lg border border-rose-500/30 transition-colors shadow-sm';
            resetButton.textContent = 'Reset';
            resetButton.addEventListener('click', () => resetearPassword(usr.username));
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'bg-red-600/80 text-white hover:bg-red-500 font-bold py-1.5 px-3 rounded-lg border border-red-300/20 transition-colors shadow-sm';
            deleteButton.textContent = 'Eliminar';
            deleteButton.addEventListener('click', () => eliminarUsuario(usr.id, usr.nombre_completo));
            actions.append(resetButton, deleteButton);
            actionCell.append(actions);
            row.append(infoCell, actionCell);
            tablaUsuariosCuerpo.append(row);
        });
    } catch (e) { console.error("Error cargando tabla de usuarios"); }
}

async function resetearPassword(username) {
    const newPassword = prompt(`Nueva contraseña temporal para ${username} (8 caracteres mínimo):`);
    if (newPassword === null) return;
    if (newPassword.length < 8) return alert("La contraseña debe tener al menos 8 caracteres.");
    if (!confirm(`¿Confirmas el cambio de contraseña para ${username}?`)) return;
    try {
        const res = await fetch('/api/usuarios/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, newPassword })
        });
        const data = await res.json();
        if (res.ok) { alert("Contraseña actualizada."); cargarUsuariosAdmin(); }
        else alert(data.error || "No fue posible actualizar la contraseña.");
    } catch (e) { alert("Error de red local."); }
}

async function eliminarUsuario(id, nombre) {
    if (!confirm(`¿Eliminar definitivamente a ${nombre}? También se eliminará su historial de puntos.`)) return;

    try {
        const res = await fetch(`/api/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'No fue posible eliminar el usuario.');

        alert(data.mensaje);
        cargarUsuariosAdmin();
    } catch (error) {
        alert('Error de red al eliminar el usuario.');
    }
}

function obtenerControlesEventos() {
    return {
        form: document.getElementById('formulario-evento'),
        title: document.getElementById('input-evento-titulo'),
        date: document.getElementById('input-evento-fecha'),
        submit: document.getElementById('btn-guardar-evento'),
        cancel: document.getElementById('btn-cancelar-evento'),
        list: document.getElementById('lista-eventos-admin'),
        badge: document.getElementById('badge-total-eventos')
    };
}

function fechaParaInput(fecha) {
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return '';
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function limpiarFormularioEvento() {
    const controls = obtenerControlesEventos();
    eventoEditandoId = null;
    controls.form.reset();
    controls.submit.textContent = 'Agregar Evento';
    controls.cancel.classList.add('hidden');
}

function editarEvento(evento) {
    const controls = obtenerControlesEventos();
    eventoEditandoId = evento.id;
    controls.title.value = evento.titulo;
    controls.date.value = fechaParaInput(evento.fecha);
    controls.submit.textContent = 'Guardar Cambios';
    controls.cancel.classList.remove('hidden');
    controls.title.focus();
}

async function cambiarEstadoEvento(id, activo) {
    try {
        const res = await fetch(`/api/eventos/${encodeURIComponent(id)}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'No fue posible actualizar el evento.');
        cargarEventosAdmin();
    } catch (error) {
        alert('Error de red al actualizar el evento.');
    }
}

async function cargarEventosAdmin() {
    const controls = obtenerControlesEventos();
    if (!controls.list) return;

    try {
        const res = await fetch('/api/eventos/admin');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No fue posible cargar los eventos.');

        const eventos = data.eventos || [];
        controls.badge.textContent = `${eventos.length} Eventos`;
        controls.list.replaceChildren();

        if (!eventos.length) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-slate-400 text-center py-2';
            empty.textContent = 'Aún no hay eventos registrados.';
            controls.list.append(empty);
            return;
        }

        eventos.forEach((evento) => {
            const item = document.createElement('div');
            item.className = 'bg-slate-950/40 border border-white/10 rounded-xl p-3 flex flex-col gap-3';
            const header = document.createElement('div');
            header.className = 'flex items-start justify-between gap-3';
            const detail = document.createElement('div');
            const title = document.createElement('p');
            title.className = 'font-semibold text-sm text-white';
            title.textContent = evento.titulo;
            const date = document.createElement('p');
            date.className = 'text-xs text-slate-400 mt-1';
            date.textContent = new Date(evento.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
            detail.append(title, date);
            const status = document.createElement('span');
            status.className = evento.activo
                ? 'text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/20 px-2 py-1 rounded-full'
                : 'text-xs font-bold text-slate-400 bg-slate-600/30 border border-slate-500/30 px-2 py-1 rounded-full';
            status.textContent = evento.activo ? 'Activo' : 'Inactivo';
            header.append(detail, status);

            const actions = document.createElement('div');
            actions.className = 'flex gap-2';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'flex-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition';
            edit.textContent = 'Editar';
            edit.addEventListener('click', () => editarEvento(evento));
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = evento.activo
                ? 'flex-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/20 text-xs font-bold py-2 px-3 rounded-lg transition'
                : 'flex-1 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-400/20 text-xs font-bold py-2 px-3 rounded-lg transition';
            toggle.textContent = evento.activo ? 'Desactivar' : 'Activar';
            toggle.addEventListener('click', () => cambiarEstadoEvento(evento.id, !evento.activo));
            actions.append(edit, toggle);
            item.append(header, actions);
            controls.list.append(item);
        });
    } catch (error) {
        controls.list.textContent = error.message;
    }
}

const formularioEvento = document.getElementById('formulario-evento');
if (formularioEvento) {
    formularioEvento.addEventListener('submit', async (event) => {
        event.preventDefault();
        const controls = obtenerControlesEventos();
        const payload = { titulo: controls.title.value.trim(), fecha: controls.date.value };
        const isEditing = eventoEditandoId !== null;
        const endpoint = isEditing ? `/api/eventos/${encodeURIComponent(eventoEditandoId)}` : '/api/eventos';
        controls.submit.disabled = true;
        controls.submit.textContent = 'Guardando…';

        try {
            const res = await fetch(endpoint, {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) return alert(data.error || 'No fue posible guardar el evento.');

            limpiarFormularioEvento();
            cargarEventosAdmin();
        } catch (error) {
            alert('Error de red al guardar el evento.');
        } finally {
            controls.submit.disabled = false;
            controls.submit.textContent = eventoEditandoId !== null ? 'Guardar Cambios' : 'Agregar Evento';
        }
    });

    document.getElementById('btn-cancelar-evento').addEventListener('click', limpiarFormularioEvento);
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

// ==========================================
// 8. HOOKS CLOUD: SESIÓN, FECHAS Y VERSÍCULOS
// No modifica los IDs existentes. Crea sus propios nodos con data-*.
// ==========================================
(() => {
    const nativeFetch = window.fetch.bind(window);
    let avisoSesionMostrado = false;
    let contadorFechas = null;

    function rutaApi(input) {
        const url = input instanceof Request ? input.url : input;
        return new URL(url, window.location.origin).pathname;
    }

    function mostrarLoginPorSesionExpirada() {
        if (avisoSesionMostrado) return;
        avisoSesionMostrado = true;

        if (escanerActivo) {
            escanerActivo.stop().catch(() => {});
            escanerActivo = null;
        }

        usuarioLogueado = null;
        pantallaUsuario.classList.add('hidden');
        pantallaAdmin.classList.add('hidden');
        contenedorAcceso.classList.remove('hidden');
        pantallaRegistro.classList.add('hidden');
        pantallaLogin.classList.remove('hidden');
        alert('Tu sesión expiró. Inicia sesión nuevamente.');
    }

    // Las cookies httpOnly viajan automáticamente en el mismo origen; este hook
    // también centraliza la reacción al vencimiento del JWT en las llamadas existentes.
    window.fetch = async (input, init = {}) => {
        const response = await nativeFetch(input, { ...init, credentials: 'same-origin' });
        const path = rutaApi(input);
        const isPublicAuth = path === '/api/login' || path === '/api/registro';
        if (response.status === 401 && !isPublicAuth) mostrarLoginPorSesionExpirada();
        return response;
    };

    window.cerrarSesion = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } finally {
            avisoSesionMostrado = false;
            mostrarLoginPorSesionExpirada();
            avisoSesionMostrado = false;
        }
    };

    function crearElemento(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function actualizarContadores() {
        document.querySelectorAll('[data-jc-countdown]').forEach((element) => {
            const remaining = Number(element.dataset.jcCountdown) - Date.now();
            if (remaining <= 0) {
                element.textContent = '¡Ya comenzó!';
                return;
            }

            const totalMinutes = Math.floor(remaining / 60000);
            const days = Math.floor(totalMinutes / 1440);
            const hours = Math.floor((totalMinutes % 1440) / 60);
            const minutes = totalMinutes % 60;
            element.textContent = `${days}d ${hours}h ${minutes}m`;
        });
    }

    function renderizarFechas(container, fechas) {
        container.replaceChildren();
        if (!fechas.length) {
            container.append(crearElemento('p', 'text-xs text-slate-400', 'Próximamente anunciaremos las fechas del campamento.'));
            return;
        }

        const fragment = document.createDocumentFragment();
        fechas.forEach(({ titulo, fecha }) => {
            const date = new Date(fecha);
            const item = crearElemento('div', 'flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0');
            const detail = crearElemento('div');
            detail.append(
                crearElemento('p', 'font-semibold text-slate-100 text-sm', titulo),
                crearElemento('p', 'text-xs text-slate-400', date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }))
            );
            const countdown = crearElemento('span', 'text-xs font-bold text-cyan-300 whitespace-nowrap');
            countdown.dataset.jcCountdown = String(date.getTime());
            item.append(detail, countdown);
            fragment.append(item);
        });
        container.append(fragment);
        actualizarContadores();
    }

    async function cargarFechasJC(container) {
        const response = await fetch('/api/eventos');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible cargar los eventos.');
        renderizarFechas(container, data.eventos || []);
    }

    async function cargarVersiculoJC(target) {
        target.textContent = 'Cargando versículo…';
        const response = await fetch('/api/versiculos');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible cargar el versículo.');
        // textContent evita interpretar contenido de la hoja como HTML.
        target.textContent = data.versiculo;
    }

    function montarWidgetsCloud() {
        const shell = document.querySelector('.app-shell');
        if (!shell || shell.querySelector('[data-jc-cloud-widgets]')) return;

        const section = crearElemento('section', 'mt-6 space-y-4 text-left', undefined);
        section.dataset.jcCloudWidgets = 'true';

        const verseCard = crearElemento('article', 'bg-slate-800/60 border border-violet-400/20 rounded-2xl p-4 shadow-lg');
        verseCard.append(crearElemento('h2', 'text-xs uppercase tracking-widest font-bold text-violet-300 mb-2', 'Versículo del día'));
        const verseText = crearElemento('p', 'text-sm leading-relaxed text-slate-200 min-h-12');
        const refreshVerse = crearElemento('button', 'mt-3 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-colors', 'Otro versículo');
        refreshVerse.type = 'button';
        refreshVerse.addEventListener('click', async () => {
            refreshVerse.disabled = true;
            try {
                await cargarVersiculoJC(verseText);
            } catch (error) {
                verseText.textContent = error.message;
            } finally {
                refreshVerse.disabled = false;
            }
        });
        verseCard.append(verseText, refreshVerse);

        const datesCard = crearElemento('article', 'bg-slate-800/60 border border-cyan-400/20 rounded-2xl p-4 shadow-lg');
        datesCard.append(crearElemento('h2', 'text-xs uppercase tracking-widest font-bold text-cyan-300 mb-2', 'Fechas importantes'));
        const datesList = crearElemento('div', 'space-y-1');
        datesCard.append(datesList);

        section.append(verseCard, datesCard);
        shell.append(section);

        cargarVersiculoJC(verseText).catch((error) => { verseText.textContent = error.message; });
        cargarFechasJC(datesList).catch((error) => { datesList.textContent = error.message; });

        if (contadorFechas) window.clearInterval(contadorFechas);
        contadorFechas = window.setInterval(actualizarContadores, 60000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', montarWidgetsCloud, { once: true });
    } else {
        montarWidgetsCloud();
    }
})();
