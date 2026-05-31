const pantallaLogin = document.getElementById('pantalla-login');
const pantallaUsuario = document.getElementById('pantalla-usuario');
const pantallaAdmin = document.getElementById('pantalla-admin');
const formularioPuntos = document.getElementById('formulario-puntos');
const lectorQrDiv = document.getElementById('lector-qr');

let idUsuarioEscaneado = null; 

// ==========================================
// 0. UX: Mostrar contraseña solo a admins
// ==========================================
const inputUsername = document.getElementById('username');
const inputPassword = document.getElementById('password');

inputUsername.addEventListener('input', () => {
    const valor = inputUsername.value.trim().toLowerCase();
    if (valor === 'admin' || valor === 'admin_general') {
        inputPassword.classList.remove('hidden');
    } else {
        inputPassword.classList.add('hidden');
        inputPassword.value = ''; // Limpiar por seguridad
    }
});

// ==========================================
// 1. LOGIN SEGURO
// ==========================================
document.getElementById('btn-entrar').addEventListener('click', async () => {
    const username = inputUsername.value.trim().toLowerCase();
    const password = inputPassword.value.trim();
    
    // Validación 1: Nadie entra sin nombre
    if (username === '') return alert("Por favor, ingresa tu usuario.");

    // Validación 2: Si es admin, es OBLIGATORIO tener contraseña
    if ((username === 'admin' || username === 'admin_general') && password === '') {
        return alert("Por favor, ingresa la contraseña de administrador.");
    }

    const btn = document.getElementById('btn-entrar');
    btn.innerText = "Verificando...";
    btn.disabled = true;

    try {
        const respuesta = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await respuesta.json();

        if (data.success) {
            pantallaLogin.classList.add('hidden'); 

            if (data.usuario.rol === 'admin') {
                pantallaAdmin.classList.remove('hidden');
                iniciarEscanerAdmin();
            } else {
                pantallaUsuario.classList.remove('hidden');
                document.getElementById('nombre-usuario').innerText = data.usuario.username;
                generarQRUsuario(data.usuario.username);
            }
        } else {
            alert(data.error); 
        }
    } catch (error) {
        alert("Error al conectar con el servidor.");
    }

    btn.innerText = "Entrar";
    btn.disabled = false;
});

// ==========================================
// 2. GENERAR QR (USUARIO)
// ==========================================
function generarQRUsuario(username) {
    const qrContenedor = document.getElementById('qr-contenedor');
    qrContenedor.innerHTML = ''; 

    const datosUsuario = JSON.stringify({ id_usuario: username });

    new QRCode(qrContenedor, {
        text: datosUsuario,
        width: 220,
        height: 220,
        colorDark : "#1e3a8a", 
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

// ==========================================
// 3. ESCANER (ADMIN)
// ==========================================
function iniciarEscanerAdmin() {
    const html5QrCode = new Html5Qrcode("lector-qr");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (textoDecodificado) => {
            html5QrCode.stop(); 
            lectorQrDiv.classList.add('hidden'); 
            
            try {
                const datos = JSON.parse(textoDecodificado);
                if (!datos.id_usuario) throw new Error("QR sin ID");
                
                idUsuarioEscaneado = datos.id_usuario;
                document.getElementById('usuario-detectado').innerText = `Calificando a: ${idUsuarioEscaneado}`;
                formularioPuntos.classList.remove('hidden');
            } catch (error) {
                alert("QR Inválido. Asegúrate de escanear un pase de lista válido.");
                lectorQrDiv.classList.remove('hidden');
                iniciarEscanerAdmin();
            }
        },
        (error) => { /* Ignorar errores de enfoque de cámara */ }
    ).catch(err => {
        console.error("Error de cámara", err);
    });
}

// ==========================================
// 4. GUARDAR PUNTOS EN BASE DE DATOS
// ==========================================
document.getElementById('btn-guardar-puntos').addEventListener('click', async () => {
    let puntosTotales = 0;
    
    const checkboxes = document.querySelectorAll('#formulario-puntos input[type="checkbox"]:checked');
    checkboxes.forEach((chk) => {
        puntosTotales += parseInt(chk.value);
    });

    if (puntosTotales === 0) return alert("Selecciona al menos una recompensa.");

    const btn = document.getElementById('btn-guardar-puntos');
    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        const respuesta = await fetch('/api/transacciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: idUsuarioEscaneado,
                puntos: puntosTotales
            })
        });

        if (respuesta.ok) {
            alert(`¡Éxito! Se sumaron ${puntosTotales} puntos a ${idUsuarioEscaneado}`);
        } else {
            alert("Hubo un error al guardar en la base de datos.");
        }
    } catch (error) {
        alert("Error de conexión con el servidor.");
    }

    // Reiniciar para el siguiente usuario
    btn.innerText = "Guardar Puntos";
    btn.disabled = false;
    formularioPuntos.classList.add('hidden');
    lectorQrDiv.classList.remove('hidden');
    document.querySelectorAll('#formulario-puntos input[type="checkbox"]').forEach(chk => chk.checked = false);
    
    iniciarEscanerAdmin();
});