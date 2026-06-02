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

let idUsuarioEscaneado = null; 
let usuarioLogueado = null; // Para saber de quién actualizar el saldo
let escanerActivo = null; 

// Navegación
document.getElementById('link-registro').addEventListener('click', (e) => { e.preventDefault(); pantallaLogin.classList.add('hidden'); pantallaRegistro.classList.remove('hidden'); });
document.getElementById('link-login').addEventListener('click', (e) => { e.preventDefault(); pantallaRegistro.classList.add('hidden'); pantallaLogin.classList.remove('hidden'); });

// 1. OBTENER SALDO EN VIVO Y CALCULAR DINERO
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

// Botón manual de refrescar saldo (Vista Usuario)
document.getElementById('btn-actualizar-saldo').addEventListener('click', () => {
    if (usuarioLogueado) cargarSaldoUsuario(usuarioLogueado);
});

// 2. REGISTRO
document.getElementById('btn-registrar').addEventListener('click', async () => {
    const telefono = document.getElementById('reg-telefono').value.trim();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    
    if (telefono.length !== 10 || isNaN(telefono)) return alert("Ingresa un número de 10 dígitos.");
    if (nombre === '' || password === '') return alert("Completa todos los campos.");

    const btn = document.getElementById('btn-registrar'); btn.innerText = "Registrando..."; btn.disabled = true;

    try {
        const respuesta = await fetch('/api/registro', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefono, nombre, password })
        });
        const data = await respuesta.json();

        if (data.success) {
            alert("¡Cuenta creada! Ya puedes iniciar sesión.");
            document.getElementById('reg-telefono').value = ''; document.getElementById('reg-nombre').value = ''; document.getElementById('reg-password').value = '';
            document.getElementById('link-login').click(); 
        } else alert(data.error); 
    } catch (error) { alert("Error al conectar."); }
    btn.innerText = "Crear Cuenta"; btn.disabled = false;
});

// 3. LOGIN
document.getElementById('btn-entrar').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    if (username === '' || password === '') return alert("Ingresa datos");

    const btn = document.getElementById('btn-entrar'); btn.innerText = "Verificando..."; btn.disabled = true;

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
            } else {
                usuarioLogueado = data.usuario.username;
                pantallaUsuario.classList.remove('hidden');
                document.getElementById('nombre-usuario').innerText = usuarioLogueado;
                generarQRUsuario(usuarioLogueado);
                cargarSaldoUsuario(usuarioLogueado); // Cargar puntos al entrar
            }
        } else alert(data.error); 
    } catch (error) { alert("Error al conectar."); }
    btn.innerText = "Entrar"; btn.disabled = false;
});

function generarQRUsuario(username) {
    const qrContenedor = document.getElementById('qr-contenedor');
    qrContenedor.innerHTML = ''; 
    new QRCode(qrContenedor, { text: JSON.stringify({ id_usuario: username }), width: 220, height: 220, colorDark : "#1e3a8a", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
}

// 4. ADMIN - SCANNER Y PESTAÑAS
tabScanner.addEventListener('click', () => {
    tabScanner.className = "text-blue-600 font-bold border-b-2 border-blue-600 pb-1 px-2 focus:outline-none"; tabUsuarios.className = "text-gray-500 font-bold pb-1 px-2 hover:text-blue-600 focus:outline-none";
    seccionAdminScanner.classList.remove('hidden'); seccionAdminUsuarios.classList.add('hidden');
    iniciarEscanerAdmin();
});

tabUsuarios.addEventListener('click', async () => {
    tabUsuarios.className = "text-blue-600 font-bold border-b-2 border-blue-600 pb-1 px-2 focus:outline-none"; tabScanner.className = "text-gray-500 font-bold pb-1 px-2 hover:text-blue-600 focus:outline-none";
    seccionAdminScanner.classList.add('hidden'); seccionAdminUsuarios.classList.remove('hidden');
    if (escanerActivo) { await escanerActivo.stop().catch(e=>console.log(e)); escanerActivo = null; lectorQrDiv.classList.remove('hidden'); formularioPuntos.classList.add('hidden'); }
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
                document.getElementById('input-canje').value = ''; // Limpiar caja de descuento
                cargarSaldoUsuario(idUsuarioEscaneado, true); // Traer saldo del escaneado para el admin
                formularioPuntos.classList.remove('hidden');
            } catch (error) {
                alert("QR Inválido."); lectorQrDiv.classList.remove('hidden'); iniciarEscanerAdmin();
            }
        }, () => {}
    ).catch(err => console.error("Error cámara"));
}

// 5. ADMIN - EJECUTAR TRANSACCIONES
async function enviarTransaccion(puntos, concepto, btnId) {
    const btn = document.getElementById(btnId);
    const textoOriginal = btn.innerText;
    btn.innerText = "Procesando..."; btn.disabled = true;

    try {
        const respuesta = await fetch('/api/transacciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: idUsuarioEscaneado, puntos: puntos, concepto: concepto })
        });
        const data = await respuesta.json();

        if (respuesta.ok) {
            alert(data.mensaje);
        } else {
            // Aquí salta el error de la Base de Datos si no tienen puntos suficientes
            alert("Error: " + data.error); 
        }
    } catch (error) { alert("Error de red."); }

    btn.innerText = textoOriginal; btn.disabled = false;
    formularioPuntos.classList.add('hidden'); lectorQrDiv.classList.remove('hidden');
    document.querySelectorAll('#formulario-puntos input[type="checkbox"]').forEach(chk => chk.checked = false);
    iniciarEscanerAdmin();
}

// Botón A: Sumar Recompensas
document.getElementById('btn-guardar-puntos').addEventListener('click', () => {
    let puntosTotales = 0;
    document.querySelectorAll('#formulario-puntos input[type="checkbox"]:checked').forEach(chk => puntosTotales += parseInt(chk.value));
    if (puntosTotales === 0) return alert("Selecciona una recompensa.");
    enviarTransaccion(puntosTotales, 'Ganancia por Asistencia', 'btn-guardar-puntos');
});

// Botón B: Descontar por Canje 
document.getElementById('btn-canjear-puntos').addEventListener('click', () => {
    const puntosDescontar = parseInt(document.getElementById('input-canje').value);
    if (isNaN(puntosDescontar) || puntosDescontar <= 0) return alert("Ingresa una cantidad válida a descontar.");
    
    // Le mandamos los puntos en NEGATIVO al backend
    enviarTransaccion(-Math.abs(puntosDescontar), 'Canje en Tienda', 'btn-canjear-puntos');
});

// 6. ADMIN - LISTA Y RESET
async function cargarUsuariosAdmin() {
    try {
        const res = await fetch('/api/usuarios'); const usuarios = await res.json();
        badgeTotalUsuarios.innerText = `${usuarios.length} Usuarios`; tablaUsuariosCuerpo.innerHTML = '';
        usuarios.forEach(usr => {
            tablaUsuariosCuerpo.innerHTML += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-3 py-4"><div class="font-bold">${usr.nombre_completo}</div><div class="text-xs text-gray-400">${usr.username}</div><div class="mt-1"><span class="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">${usr.puntos_totales} pts ($${(usr.puntos_totales*0.5).toFixed(2)})</span></div></td>
                    <td class="px-3 py-4 text-center"><button onclick="resetearPassword('${usr.username}')" class="bg-red-50 text-red-600 font-bold py-1 px-2 rounded border border-red-200">Reset</button></td>
                </tr>`;
        });
    } catch (e) { console.error("Error cargando tabla"); }
}

async function resetearPassword(username) {
    if (!confirm(`¿Resetear la clave de ${username} a '1234'?`)) return;
    try {
        const res = await fetch('/api/usuarios/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
        if (res.ok) { alert("Clave reestablecida a: 1234"); cargarUsuariosAdmin(); }
    } catch (e) { alert("Error de red."); }
}