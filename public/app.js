'use strict';

// ==========================================
// ESTADO Y REFERENCIAS DE LA APLICACIÓN
// ==========================================
const $ = (id) => document.getElementById(id);

const dom = {
    publicView: $('vista-publica'),
    access: $('contenedor-acceso'),
    loginForm: $('form-login'),
    registerForm: $('form-registro'),
    userView: $('pantalla-usuario'),
    adminView: $('pantalla-admin'),
    sessionBar: $('barra-sesion'),
    sessionIdentity: $('sesion-identidad'),
    logoutButton: $('btn-cerrar-sesion'),
    widgets: $('dashboard-widgets'),
    scannerTab: $('tab-scanner'),
    usersTab: $('tab-usuarios'),
    eventsTab: $('tab-eventos'),
    scannerPanel: $('seccion-admin-scanner'),
    usersPanel: $('seccion-admin-usuarios'),
    eventsPanel: $('seccion-admin-eventos'),
    scanner: $('lector-qr'),
    pointsForm: $('formulario-puntos'),
    usersBody: $('tabla-usuarios-cuerpo'),
    usersBadge: $('badge-total-usuarios')
};

const state = {
    user: null,
    scannedUsername: null,
    scanner: null,
    activeAdminTab: 'scanner',
    events: [],
    editingEventId: null,
    eventImageData: undefined,
    currentEventImage: null,
    countdownTimer: null
};

const MAX_IMAGE_BYTES = 1_500_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function isAdmin(user = state.user) {
    return String(user?.rol || '').trim().toLowerCase() === 'admin';
}

function formatDate(value, options = { dateStyle: 'long', timeStyle: 'short' }) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha por anunciar' : date.toLocaleString('es-MX', options);
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('El servidor respondió en un formato inesperado.');
    }
}

// Centraliza cookies, JSON y expiración de sesión sin reemplazar window.fetch.
async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: options.body
            ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
            : options.headers
    });
    const data = await parseJsonResponse(response);

    if (response.status === 401 && state.user && path !== '/api/login') {
        await showPublicView({ reloadLanding: true });
        alert('Tu sesión expiró. Inicia sesión nuevamente.');
    }
    if (!response.ok) {
        const error = new Error(data.error || data.message || 'No fue posible completar la solicitud.');
        error.status = response.status;
        throw error;
    }
    return data;
}

// ==========================================
// SESIÓN: FUENTE ÚNICA DE VERDAD
// ==========================================
async function stopScanner() {
    if (!state.scanner) return;
    await state.scanner.stop().catch(() => {});
    state.scanner = null;
}

function setWidgetsVisible(visible) {
    dom.widgets.classList.toggle('hidden', !visible);
    dom.widgets.setAttribute('aria-hidden', String(!visible));
    if (!visible && state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
    if (visible) loadDashboardWidgets();
}

// Restaura el estado público completo y limpia todas las referencias privadas.
async function showPublicView({ reloadLanding = false } = {}) {
    await stopScanner();
    state.user = null;
    state.scannedUsername = null;
    state.activeAdminTab = 'scanner';
    clearEventForm();

    dom.userView.classList.add('hidden');
    dom.adminView.classList.add('hidden');
    dom.sessionBar.classList.add('hidden');
    dom.sessionBar.classList.remove('flex');
    dom.publicView.classList.remove('hidden');
    dom.access.classList.remove('hidden');
    showLoginForm();
    setWidgetsVisible(false);

    if (reloadLanding) await loadPublicLanding();
}

// Reconstruye Dashboard y Logout usando exclusivamente el usuario del JWT.
async function showAuthenticatedDashboard(user) {
    state.user = user;
    dom.publicView.classList.add('hidden');
    dom.access.classList.add('hidden');
    dom.sessionIdentity.textContent = `${user.username} · ${isAdmin(user) ? 'Admin' : 'Participante'}`;
    dom.sessionBar.classList.remove('hidden');
    dom.sessionBar.classList.add('flex');

    if (isAdmin(user)) {
        dom.userView.classList.add('hidden');
        dom.adminView.classList.remove('hidden');
        await activateAdminTab('scanner');
    } else {
        dom.adminView.classList.add('hidden');
        dom.userView.classList.remove('hidden');
        $('nombre-usuario').textContent = user.username;
        generateUserQr(user.username);
        loadUserBalance(user.username);
    }
    setWidgetsVisible(true);
}

// checkSession se ejecuta en cada carga/F5. La cookie httpOnly decide la vista.
async function checkSession() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.usuario) throw new Error('Sin sesión');
        await showAuthenticatedDashboard(data.usuario);
    } catch {
        await showPublicView({ reloadLanding: false });
    }
}

async function logout() {
    const originalText = dom.logoutButton.textContent;
    dom.logoutButton.disabled = true;
    dom.logoutButton.textContent = 'Saliendo…';
    try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (error) {
        console.warn('No fue posible confirmar el logout:', error);
    } finally {
        await showPublicView({ reloadLanding: true });
        dom.logoutButton.disabled = false;
        dom.logoutButton.textContent = originalText;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==========================================
// LANDING PÚBLICA
// ==========================================
function resetFeaturedEvent() {
    $('landing-titulo').textContent = 'El Campamento';
    $('landing-lema').textContent = 'Muy pronto conocerás todos los detalles.';
    $('landing-fecha').textContent = 'Por anunciar';
    $('landing-costo').textContent = 'Por anunciar';
    $('landing-lugar').textContent = 'Por anunciar';
    $('landing-telefono').textContent = 'Por anunciar';
    $('landing-telefono').href = '#acceso';
    $('landing-imagen').src = 'campamento-logo.svg';
}

function renderFeaturedEvent(event) {
    if (!event) {
        resetFeaturedEvent();
        return;
    }
    $('landing-titulo').textContent = event.titulo;
    $('landing-lema').textContent = event.lema || 'Una experiencia para crecer juntos.';
    $('landing-fecha').textContent = formatDate(event.fecha);
    $('landing-costo').textContent = event.costo || 'Por anunciar';
    $('landing-lugar').textContent = event.lugar || 'Por anunciar';
    $('landing-telefono').textContent = event.telefono || 'Por anunciar';
    $('landing-telefono').href = event.telefono ? `tel:${event.telefono.replace(/[^\d+]/g, '')}` : '#acceso';
    $('landing-imagen').src = event.imagen || 'campamento-logo.svg';
}

function createAgendaCard(event) {
    const card = createElement('article', 'glass-card rounded-2xl border border-white/10 p-4');
    const eyebrow = createElement('p', 'text-[.68rem] font-bold uppercase tracking-widest text-violet-300', 'Evento especial');
    const title = createElement('h3', 'mt-1 text-lg font-extrabold text-white', event.titulo);
    const date = createElement('p', 'mt-3 text-sm font-semibold text-cyan-200', formatDate(event.fecha, { dateStyle: 'medium', timeStyle: 'short' }));
    card.append(eyebrow, title, date);
    if (event.lugar) card.append(createElement('p', 'mt-2 text-xs text-slate-400', event.lugar));
    return card;
}

// La Landing usa sólo el endpoint público, que ya filtra activo = true.
async function loadPublicLanding() {
    const agenda = $('landing-agenda');
    try {
        const data = await apiRequest('/api/eventos');
        const events = data.eventos || [];
        renderFeaturedEvent(events.find((event) => event.es_estelar === true));
        const secondaryEvents = events.filter((event) => event.es_estelar !== true);
        agenda.replaceChildren();
        if (!secondaryEvents.length) {
            agenda.append(createElement('p', 'text-sm text-slate-400 sm:col-span-2 lg:col-span-3', 'Próximamente anunciaremos nuevas actividades.'));
            return;
        }
        secondaryEvents.forEach((event) => agenda.append(createAgendaCard(event)));
    } catch (error) {
        resetFeaturedEvent();
        agenda.replaceChildren(createElement('p', 'text-sm text-rose-200 sm:col-span-2 lg:col-span-3', error.message));
    }
}

// ==========================================
// LOGIN Y REGISTRO
// ==========================================
function showLoginForm() {
    dom.registerForm.classList.add('hidden');
    dom.loginForm.classList.remove('hidden');
}

function showRegisterForm() {
    dom.loginForm.classList.add('hidden');
    dom.registerForm.classList.remove('hidden');
}

async function handleLogin(event) {
    event.preventDefault();
    const username = $('login-username').value.trim().toLowerCase();
    const password = $('login-password').value;
    const button = $('btn-entrar');
    button.disabled = true;
    button.textContent = 'Verificando…';
    try {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        dom.loginForm.reset();
        await showAuthenticatedDashboard(data.usuario);
    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Entrar';
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const telefono = $('reg-telefono').value.trim();
    const nombre = $('reg-nombre').value.trim();
    const password = $('reg-password').value;
    if (!/^\d{10}$/.test(telefono)) return alert('Ingresa un teléfono de 10 dígitos.');

    const button = $('btn-registrar');
    button.disabled = true;
    button.textContent = 'Registrando…';
    try {
        await apiRequest('/api/registro', {
            method: 'POST',
            body: JSON.stringify({ telefono, nombre, password })
        });
        dom.registerForm.reset();
        showLoginForm();
        alert('Cuenta creada. Ya puedes iniciar sesión.');
    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Crear cuenta';
    }
}

function setupPasswordToggle(buttonId, inputId) {
    const button = $(buttonId);
    const input = $(inputId);
    button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? '🙈' : '👁️';
        button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
}

// ==========================================
// DASHBOARD DE USUARIO
// ==========================================
function generateUserQr(username) {
    const container = $('qr-contenedor');
    container.replaceChildren();
    new QRCode(container, {
        text: JSON.stringify({ id_usuario: username }),
        width: 220,
        height: 220,
        colorDark: '#020617',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

async function loadUserBalance(username, adminMode = false) {
    try {
        const data = await apiRequest(`/api/usuarios/${encodeURIComponent(username)}`);
        const equivalent = (Number(data.puntos) * 0.5).toFixed(2);
        if (adminMode) {
            $('admin-saldo-usuario').textContent = data.puntos;
            $('admin-saldo-mxn').textContent = equivalent;
        } else {
            $('saldo-usuario').textContent = data.puntos;
            $('saldo-mxn').textContent = equivalent;
        }
    } catch (error) {
        console.error('Error al cargar el saldo:', error);
    }
}

// ==========================================
// NAVEGACIÓN Y ESCÁNER ADMIN
// ==========================================
const adminTabs = {
    scanner: { button: dom.scannerTab, panel: dom.scannerPanel },
    users: { button: dom.usersTab, panel: dom.usersPanel },
    events: { button: dom.eventsTab, panel: dom.eventsPanel }
};

async function activateAdminTab(tabId) {
    if (!isAdmin()) return;
    state.activeAdminTab = tabId;
    Object.entries(adminTabs).forEach(([id, tab]) => {
        const active = id === tabId;
        tab.button.setAttribute('aria-selected', String(active));
        tab.button.tabIndex = active ? 0 : -1;
        tab.panel.classList.toggle('hidden', !active);
    });

    if (tabId === 'scanner') return startScanner();
    await stopScanner();
    if (tabId === 'users') loadAdminUsers();
    if (tabId === 'events') loadAdminEvents();
}

function handleDecodedQr(decodedText) {
    try {
        const data = JSON.parse(decodedText);
        if (!data.id_usuario) throw new Error('QR inválido');
        state.scannedUsername = data.id_usuario;
        $('usuario-detectado').textContent = `Calificando a: ${state.scannedUsername}`;
        $('input-canje').value = '';
        loadUserBalance(state.scannedUsername, true);
        dom.scanner.classList.add('hidden');
        dom.pointsForm.classList.remove('hidden');
    } catch {
        alert('El QR no pertenece a JC App.');
    }
}

function renderScannerFallback() {
    dom.scanner.innerHTML = '<div class="p-7 text-center"><p class="text-3xl">📷</p><p class="mt-3 font-bold text-amber-300">Cámara no disponible</p><p class="mt-2 text-sm text-slate-400">Puedes usar la asignación manual desde este panel.</p></div>';
}

async function startScanner() {
    if (state.scanner || state.activeAdminTab !== 'scanner' || !isAdmin()) return;
    if (typeof Html5Qrcode !== 'function') return renderScannerFallback();
    dom.scanner.classList.remove('hidden');
    dom.pointsForm.classList.add('hidden');
    state.scanner = new Html5Qrcode('lector-qr');
    try {
        await state.scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (text) => {
                await stopScanner();
                handleDecodedQr(text);
            },
            () => {}
        );
    } catch {
        state.scanner = null;
        renderScannerFallback();
    }
}

// ==========================================
// PUNTOS Y USUARIOS ADMIN
// ==========================================
async function sendTransaction(points, concept, buttonId) {
    let username = state.scannedUsername;
    if (buttonId === 'btn-manual-puntos' && !username) {
        username = prompt('Teléfono del campista (10 dígitos):');
    }
    if (!/^\d{10}$/.test(username || '')) return alert('Selecciona o ingresa un usuario válido.');

    const button = $(buttonId);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Procesando…';
    try {
        const data = await apiRequest('/api/transacciones', {
            method: 'POST',
            body: JSON.stringify({ username, puntos: points, concepto: concept })
        });
        alert(data.mensaje);
    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function loadAdminUsers() {
    if (!isAdmin()) return;
    try {
        const users = await apiRequest('/api/usuarios');
        dom.usersBadge.textContent = `${users.length} usuarios`;
        dom.usersBody.replaceChildren();
        users.forEach((user) => {
            const row = createElement('tr', 'border-b border-white/5');
            const info = createElement('td', 'px-4 py-4');
            info.append(
                createElement('p', 'font-bold text-white', user.nombre_completo),
                createElement('p', 'text-xs text-slate-400', user.username),
                createElement('p', 'mt-1 text-xs font-bold text-emerald-300', `${user.puntos_totales} pts · $${(user.puntos_totales * 0.5).toFixed(2)}`)
            );
            const actionsCell = createElement('td', 'px-4 py-4');
            const actions = createElement('div', 'flex justify-center gap-2');
            const passwordButton = createElement('button', 'rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-200', 'Cambiar contraseña');
            passwordButton.type = 'button';
            passwordButton.addEventListener('click', () => resetPassword(user.username));
            const deleteButton = createElement('button', 'rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white', 'Eliminar');
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', () => deleteUser(user.id, user.nombre_completo));
            actions.append(passwordButton, deleteButton);
            actionsCell.append(actions);
            row.append(info, actionsCell);
            dom.usersBody.append(row);
        });
    } catch (error) {
        alert(error.message);
    }
}

async function resetPassword(username) {
    const newPassword = prompt(`Nueva contraseña temporal para ${username}:`);
    if (newPassword === null) return;
    if (newPassword.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
    try {
        await apiRequest('/api/usuarios/reset-password', {
            method: 'POST',
            body: JSON.stringify({ username, newPassword })
        });
        alert('Contraseña actualizada.');
    } catch (error) {
        alert(error.message);
    }
}

async function deleteUser(id, name) {
    if (!confirm(`¿Eliminar definitivamente a ${name}?`)) return;
    try {
        await apiRequest(`/api/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
        loadAdminUsers();
    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// CRUD COMPLETO DE EVENTOS
// ==========================================
const eventControls = {
    form: $('formulario-evento'),
    title: $('input-evento-titulo'),
    date: $('input-evento-fecha'),
    cost: $('input-evento-costo'),
    slogan: $('input-evento-lema'),
    place: $('input-evento-lugar'),
    phone: $('input-evento-telefono'),
    image: $('input-evento-imagen'),
    featured: $('input-evento-estelar'),
    submit: $('btn-guardar-evento'),
    cancel: $('btn-cancelar-evento'),
    previewWrap: $('contenedor-preview-evento'),
    preview: $('preview-evento-imagen'),
    previewName: $('preview-evento-nombre'),
    removeImage: $('btn-quitar-imagen-evento'),
    featuredCard: $('evento-campamento-admin'),
    list: $('lista-eventos-admin'),
    badge: $('badge-total-eventos')
};

function dateForInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function showEventImagePreview(source, name = 'Imagen actual') {
    if (!source) {
        eventControls.previewWrap.classList.add('hidden');
        eventControls.previewWrap.classList.remove('flex');
        eventControls.preview.removeAttribute('src');
        eventControls.previewName.textContent = '';
        return;
    }
    eventControls.preview.src = source;
    eventControls.previewName.textContent = name;
    eventControls.previewWrap.classList.remove('hidden');
    eventControls.previewWrap.classList.add('flex');
}

function updateFeaturedRequirements() {
    const required = eventControls.featured.checked;
    [eventControls.cost, eventControls.slogan, eventControls.place, eventControls.phone].forEach((input) => {
        input.required = required;
    });
    eventControls.image.required = required && !state.currentEventImage && !state.eventImageData;
}

// Limpia tanto el formulario como los datos Base64 que nunca deben sobrevivir a otra edición.
function clearEventForm() {
    if (!eventControls.form) return;
    state.editingEventId = null;
    state.eventImageData = undefined;
    state.currentEventImage = null;
    eventControls.form.reset();
    eventControls.submit.textContent = 'Crear evento';
    eventControls.cancel.classList.add('hidden');
    showEventImagePreview(null);
    updateFeaturedRequirements();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No fue posible leer la imagen.'));
        reader.readAsDataURL(file);
    });
}

// Convierte la imagen en el navegador y replica los límites del backend.
async function handleEventImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        eventControls.image.value = '';
        return alert('Usa una imagen PNG, JPEG, WEBP o GIF.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
        eventControls.image.value = '';
        return alert('La imagen no debe superar 1.5 MB.');
    }
    try {
        state.eventImageData = await fileToBase64(file);
        showEventImagePreview(state.eventImageData, file.name);
        updateFeaturedRequirements();
    } catch (error) {
        alert(error.message);
    }
}

function editEvent(event) {
    state.editingEventId = event.id;
    state.eventImageData = undefined;
    state.currentEventImage = event.imagen || null;
    eventControls.title.value = event.titulo || '';
    eventControls.date.value = dateForInput(event.fecha);
    eventControls.cost.value = event.costo || '';
    eventControls.slogan.value = event.lema || '';
    eventControls.place.value = event.lugar || '';
    eventControls.phone.value = event.telefono || '';
    eventControls.featured.checked = event.es_estelar === true;
    eventControls.submit.textContent = 'Guardar cambios';
    eventControls.cancel.classList.remove('hidden');
    showEventImagePreview(event.imagen, 'Imagen actual');
    updateFeaturedRequirements();
    eventControls.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    eventControls.title.focus({ preventScroll: true });
}

function buildEventPayload() {
    const payload = {
        titulo: eventControls.title.value.trim(),
        fecha: eventControls.date.value,
        costo: eventControls.cost.value.trim() || null,
        lema: eventControls.slogan.value.trim() || null,
        lugar: eventControls.place.value.trim() || null,
        telefono: eventControls.phone.value.trim() || null,
        es_estelar: eventControls.featured.checked
    };

    // undefined en PUT conserva la imagen; null la elimina explícitamente.
    if (state.editingEventId === null || state.eventImageData !== undefined) {
        payload.imagen = state.eventImageData ?? null;
    }
    return payload;
}

function validateFeaturedEvent(payload) {
    if (!payload.es_estelar) return true;
    const otherFeatured = state.events.find((event) => event.es_estelar === true && event.id !== state.editingEventId);
    if (otherFeatured) {
        alert(`Ya existe un evento estelar: ${otherFeatured.titulo}. Edítalo o elimínalo antes de crear otro.`);
        return false;
    }
    return true;
}

async function saveEvent(event) {
    event.preventDefault();
    if (!isAdmin()) return alert('Tu sesión no tiene permisos de administrador.');
    updateFeaturedRequirements();
    if (!eventControls.form.reportValidity()) return;

    const payload = buildEventPayload();
    if (!validateFeaturedEvent(payload)) return;
    const editing = state.editingEventId !== null;
    const endpoint = editing ? `/api/eventos/${encodeURIComponent(state.editingEventId)}` : '/api/eventos';
    eventControls.submit.disabled = true;
    eventControls.submit.textContent = 'Guardando…';
    try {
        await apiRequest(endpoint, {
            method: editing ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        clearEventForm();
        await Promise.all([loadAdminEvents(), loadPublicLanding()]);
    } catch (error) {
        alert(error.message);
    } finally {
        eventControls.submit.disabled = false;
        eventControls.submit.textContent = state.editingEventId === null ? 'Crear evento' : 'Guardar cambios';
    }
}

async function deleteEvent(event) {
    if (!isAdmin()) return;
    if (!confirm(`¿Eliminar definitivamente “${event.titulo}”? Esta acción no se puede deshacer.`)) return;
    try {
        await apiRequest(`/api/eventos/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
        if (state.editingEventId === event.id) clearEventForm();
        await Promise.all([loadAdminEvents(), loadPublicLanding()]);
    } catch (error) {
        alert(error.message);
    }
}

async function toggleEventStatus(event) {
    try {
        await apiRequest(`/api/eventos/${encodeURIComponent(event.id)}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ activo: !event.activo })
        });
        await Promise.all([loadAdminEvents(), loadPublicLanding()]);
    } catch (error) {
        alert(error.message);
    }
}

function createEventActions(event) {
    const actions = createElement('div', 'mt-3 grid grid-cols-3 gap-2');
    const edit = createElement('button', 'rounded-lg bg-slate-700 px-2 py-2 text-xs font-bold hover:bg-slate-600', 'Editar');
    const status = createElement('button', event.activo ? 'rounded-lg bg-amber-500/20 px-2 py-2 text-xs font-bold text-amber-200' : 'rounded-lg bg-emerald-500/20 px-2 py-2 text-xs font-bold text-emerald-200', event.activo ? 'Ocultar' : 'Publicar');
    const remove = createElement('button', 'rounded-lg bg-rose-600 px-2 py-2 text-xs font-bold text-white hover:bg-rose-500', 'Eliminar');
    [edit, status, remove].forEach((button) => { button.type = 'button'; });
    edit.addEventListener('click', () => editEvent(event));
    status.addEventListener('click', () => toggleEventStatus(event));
    remove.addEventListener('click', () => deleteEvent(event));
    actions.append(edit, status, remove);
    return actions;
}

function createAdminEventCard(event, featured = false) {
    const card = createElement('article', featured
        ? 'rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-violet-950/70 to-cyan-950/45 p-4'
        : 'rounded-2xl border border-white/10 bg-slate-950/40 p-4');
    const header = createElement('div', 'flex items-start justify-between gap-3');
    const detail = createElement('div');
    detail.append(
        createElement('p', 'font-extrabold text-white', event.titulo),
        createElement('p', 'mt-1 text-xs text-cyan-200', formatDate(event.fecha, { dateStyle: 'medium', timeStyle: 'short' }))
    );
    const badge = createElement('span', event.activo ? 'rounded-full bg-emerald-500/15 px-2 py-1 text-[.68rem] font-bold text-emerald-200' : 'rounded-full bg-slate-600/30 px-2 py-1 text-[.68rem] font-bold text-slate-300', event.activo ? 'Publicado' : 'Oculto');
    header.append(detail, badge);
    card.append(header);
    if (featured) {
        const meta = [event.costo, event.lugar, event.telefono].filter(Boolean).join(' · ');
        if (event.lema) card.append(createElement('p', 'mt-3 text-sm italic text-fuchsia-100', event.lema));
        if (meta) card.append(createElement('p', 'mt-2 text-xs text-slate-300', meta));
    }
    card.append(createEventActions(event));
    return card;
}

async function loadAdminEvents() {
    if (!isAdmin()) return;
    try {
        const data = await apiRequest('/api/eventos/admin');
        state.events = data.eventos || [];
        const featured = state.events.find((event) => event.es_estelar === true);
        const common = state.events.filter((event) => event.es_estelar !== true);
        eventControls.badge.textContent = `${state.events.length} eventos`;
        eventControls.featuredCard.replaceChildren();
        eventControls.list.replaceChildren();

        if (featured) {
            eventControls.featuredCard.append(createElement('p', 'mb-2 text-xs font-black uppercase tracking-widest text-fuchsia-300', 'Evento estelar'));
            eventControls.featuredCard.append(createAdminEventCard(featured, true));
        } else {
            eventControls.featuredCard.append(createElement('p', 'rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400', 'No hay un evento estelar configurado.'));
        }
        if (!common.length) {
            eventControls.list.append(createElement('p', 'text-sm text-slate-400 sm:col-span-2', 'No hay eventos complementarios.'));
        } else {
            common.forEach((event) => eventControls.list.append(createAdminEventCard(event)));
        }
    } catch (error) {
        eventControls.list.replaceChildren(createElement('p', 'text-sm text-rose-200', error.message));
    }
}

// ==========================================
// WIDGETS PRIVADOS
// ==========================================
function updateCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach((element) => {
        const remaining = Number(element.dataset.countdown) - Date.now();
        if (remaining <= 0) return element.textContent = '¡Ya comenzó!';
        const minutes = Math.floor(remaining / 60000);
        element.textContent = `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h ${minutes % 60}m`;
    });
}

async function loadVerse() {
    const target = $('versiculo-dashboard');
    target.textContent = 'Cargando…';
    try {
        const data = await apiRequest('/api/versiculos');
        target.textContent = data.versiculo;
    } catch (error) {
        target.textContent = error.message;
    }
}

async function loadImportantDates() {
    const target = $('fechas-dashboard');
    try {
        const data = await apiRequest('/api/eventos');
        target.replaceChildren();
        (data.eventos || []).slice(0, 4).forEach((event) => {
            const row = createElement('div', 'flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0');
            const detail = createElement('div');
            detail.append(createElement('p', 'text-sm font-semibold', event.titulo), createElement('p', 'text-xs text-slate-400', formatDate(event.fecha, { dateStyle: 'medium', timeStyle: 'short' })));
            const countdown = createElement('span', 'whitespace-nowrap text-xs font-bold text-cyan-300');
            countdown.dataset.countdown = String(new Date(event.fecha).getTime());
            row.append(detail, countdown);
            target.append(row);
        });
        updateCountdowns();
    } catch (error) {
        target.textContent = error.message;
    }
}

function loadDashboardWidgets() {
    loadVerse();
    loadImportantDates();
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(updateCountdowns, 60000);
}

// ==========================================
// EVENTOS DEL DOM Y ARRANQUE
// ==========================================
function bindEvents() {
    dom.loginForm.addEventListener('submit', handleLogin);
    dom.registerForm.addEventListener('submit', handleRegister);
    dom.logoutButton.addEventListener('click', logout);
    $('link-registro').addEventListener('click', (event) => { event.preventDefault(); showRegisterForm(); });
    $('link-login').addEventListener('click', (event) => { event.preventDefault(); showLoginForm(); });
    $('btn-actualizar-saldo').addEventListener('click', () => state.user && loadUserBalance(state.user.username));
    $('btn-otro-versiculo').addEventListener('click', loadVerse);
    setupPasswordToggle('toggle-login-password', 'login-password');
    setupPasswordToggle('toggle-reg-password', 'reg-password');

    dom.scannerTab.addEventListener('click', () => activateAdminTab('scanner'));
    dom.usersTab.addEventListener('click', () => activateAdminTab('users'));
    dom.eventsTab.addEventListener('click', () => activateAdminTab('events'));
    Object.values(adminTabs).forEach(({ button }) => {
        button.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const buttons = Object.values(adminTabs).map((tab) => tab.button);
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const next = (buttons.indexOf(button) + direction + buttons.length) % buttons.length;
            buttons[next].focus();
            buttons[next].click();
        });
    });

    $('btn-guardar-puntos').addEventListener('click', () => {
        const points = [...document.querySelectorAll('#formulario-puntos input[type="checkbox"]:checked')].reduce((sum, input) => sum + Number(input.value), 0);
        if (!points) return alert('Selecciona al menos una recompensa.');
        sendTransaction(points, 'Ganancia por asistencia', 'btn-guardar-puntos');
    });
    $('btn-canjear-puntos').addEventListener('click', () => {
        const points = Number.parseInt($('input-canje').value, 10);
        if (!Number.isInteger(points) || points <= 0) return alert('Ingresa una cantidad válida.');
        sendTransaction(-points, 'Canje en tienda', 'btn-canjear-puntos');
    });
    $('btn-manual-puntos').addEventListener('click', () => {
        const points = Number.parseInt($('input-puntos-manual').value, 10);
        const concept = $('input-concepto-manual').value.trim();
        if (!Number.isInteger(points) || points === 0 || !concept) return alert('Ingresa puntos y motivo válidos.');
        sendTransaction(points, concept, 'btn-manual-puntos');
    });

    eventControls.form.addEventListener('submit', saveEvent);
    eventControls.cancel.addEventListener('click', clearEventForm);
    eventControls.image.addEventListener('change', handleEventImage);
    eventControls.featured.addEventListener('change', updateFeaturedRequirements);
    eventControls.removeImage.addEventListener('click', () => {
        state.eventImageData = null;
        state.currentEventImage = null;
        eventControls.image.value = '';
        showEventImagePreview(null);
        updateFeaturedRequirements();
    });
}

window.addEventListener('error', (event) => console.error('Error de interfaz:', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => console.error('Promesa rechazada:', event.reason));

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    clearEventForm();
    await loadPublicLanding();
    await checkSession();
});

// Se expone únicamente para diagnóstico manual desde la consola.
window.checkSession = checkSession;
