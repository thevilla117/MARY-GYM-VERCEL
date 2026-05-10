// Configuración de Supabase
const SUPABASE_URL = "https://zmvrfdtacxdudjmiswka.supabase.co";
const SUPABASE_KEY = "sb_publishable__w3Thfledx3ORdNHxCigrw_WjyShcDg";

// Estado de la aplicación
let currentUser = null;
let userRole = null;
let clientes = [];
let tarifas = {
    "Normal": { "Rutina": 5000, "Semana": 20000, "Quincena": 40000, "Mensual": 60000 },
    "Con Entrenadora": { "Rutina": 10000, "Semana": 30000, "Quincena": 60000, "Mensual": 100000 }
};

// Elementos del DOM
const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Helper para Hash SHA-256 (igual que en Python)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Helper para peticiones a Supabase
async function supabaseRequest(method, table, params = {}, jsonData = null) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    
    // Construir query params
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        queryParams.append(key, value);
    }
    if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
    }

    const headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
    };

    if (method === "POST" || method === "PATCH") {
        headers["Prefer"] = "return=representation";
    }

    const options = {
        method: method,
        headers: headers
    };

    if (jsonData) {
        options.body = JSON.stringify(jsonData);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error en Supabase: ${response.status} - ${errorText}`);
            return [];
        }
        if (response.status === 204) return [];
        return await response.json();
    } catch (error) {
        console.error("Error de conexión:", error);
        return [];
    }
}

// Manejo de Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const hashedPassword = await hashPassword(password);
    
    const params = {
        "username": `eq.${username}`,
        "password": `eq.${hashedPassword}`,
        "select": "username,rol"
    };
    
    const res = await supabaseRequest("GET", "usuarios", params);
    
    if (res && res.length > 0) {
        currentUser = res[0].username;
        userRole = res[0].rol;
        
        // Mostrar/Ocultar cosas según el rol
        if (userRole === 'super_admin') {
            document.getElementById('tab-config').style.display = 'inline-block';
        }
        
        loginScreen.style.display = 'none';
        mainContent.style.display = 'block';
        
        // Cargar datos iniciales
        await loadAllData();
    } else {
        loginError.style.display = 'block';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    currentUser = null;
    userRole = null;
    loginScreen.style.display = 'block';
    mainContent.style.display = 'none';
    loginForm.reset();
    loginError.style.display = 'none';
});

// Navegación por Tabs
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        
        // Recargar datos específicos según la pestaña si es necesario
        if (tabId === 'dashboard') loadClientes();
        if (tabId === 'asistencia') loadAsistenciaHoy();
        if (tabId === 'historial') loadHistorialPagos();
        if (tabId === 'hist-asistencia') loadHistorialAsistencia();
    });
});

// Cargar todos los datos
async function loadAllData() {
    await loadTarifas();
    await loadClientes();
    await loadMetrics();
    await loadAsistenciaHoy();
    populateClientesSelects();
}

// Cargar Tarifas
async function loadTarifas() {
    const res = await supabaseRequest("GET", "tarifas", { "select": "categoria,plan_tipo,monto" });
    if (res && res.length > 0) {
        res.forEach(r => {
            if (tarifas[r.categoria]) {
                tarifas[r.categoria][r.plan_tipo] = r.monto;
            }
        });
    }
    renderTarifas();
}

// Renderizar Tarifas en la pestaña de pagos
function renderTarifas() {
    const normalDiv = document.getElementById('tarifas-normal');
    const entrenadoraDiv = document.getElementById('tarifas-entrenadora');
    
    let htmlNormal = "";
    for (const [plan, monto] of Object.entries(tarifas["Normal"])) {
        htmlNormal += `<div class="tarifa-item"><span>${plan}</span><span>$${monto.toLocaleString()}</span></div>`;
    }
    normalDiv.innerHTML = htmlNormal;
    
    let htmlEntrenadora = "";
    for (const [plan, monto] of Object.entries(tarifas["Con Entrenadora"])) {
        htmlEntrenadora += `<div class="tarifa-item"><span>${plan}</span><span>$${monto.toLocaleString()}</span></div>`;
    }
    entrenadoraDiv.innerHTML = htmlEntrenadora;
}

// Cargar Clientes
async function loadClientes() {
    const params = {
        "or": "(borrado.is.null,borrado.eq.false)",
        "select": "*"
    };
    const res = await supabaseRequest("GET", "clientes", params);
    clientes = res || [];
    renderDashboard();
    populateClientesSelects();
}

// Renderizar Dashboard
function renderDashboard() {
    const activosDiv = document.getElementById('clientes-activos');
    const porVencerDiv = document.getElementById('clientes-por-vencer');
    const vencidosDiv = document.getElementById('clientes-vencidos');
    const rutinasDiv = document.getElementById('rutinas-hoy');
    
    activosDiv.innerHTML = "";
    porVencerDiv.innerHTML = "";
    vencidosDiv.innerHTML = "";
    rutinasDiv.innerHTML = "";
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    clientes.forEach(c => {
        if (c.nombre === "CLIENTE CASUAL") return;
        
        const vencimiento = new Date(c.fecha_vencimiento);
        vencimiento.setHours(0,0,0,0);
        
        const diffTime = vencimiento - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const card = document.createElement('div');
        card.className = "client-card";
        
        let badgeClass = "badge-active";
        let badgeText = "Activo";
        let daysText = `${diffDays} días`;
        
        if (diffDays < 0) {
            badgeClass = "badge-expired";
            badgeText = "Vencido";
            daysText = `${Math.abs(diffDays)} días`;
        } else if (diffDays <= 3) {
            badgeClass = "badge-warning";
            badgeText = "Alerta";
        }
        
        card.innerHTML = `
            <div>
                <div class="client-name">${c.nombre}</div>
                <div class="badge-plan">${c.plan_actual || 'Plan'}</div>
                <div class="client-info">Vence: <span class="highlight">${c.fecha_vencimiento}</span> <span class="days-badge">${daysText}</span></div>
            </div>
            <div>
                <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
        `;
        
        // Agregar botón de WhatsApp si está por vencer o vencido
        if (diffDays <= 3 && c.telefono) {
            const telLimpio = c.telefono.replace(/\D/g, '');
            const msg = diffDays < 0 
                ? `Hola ${c.nombre}, tu plan en MARY'S GYM ya venció. Te invitamos a renovarlo. ¡Gracias!`
                : `Hola ${c.nombre}, te recordamos que tu plan en MARY'S GYM está por vencer. ¡Te esperamos!`;
            
            const waLink = `https://wa.me/${telLimpio}?text=${encodeURIComponent(msg)}`;
            const waDiv = document.createElement('div');
            waDiv.style.textAlign = "right";
            waDiv.style.marginTop = "5px";
            waDiv.innerHTML = `<a href="${waLink}" target="_blank" class="wa-link"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>`;
            card.querySelector('div').appendChild(waDiv);
        }
        
        // Clasificar según días
        if (c.plan_actual === "Rutina" && c.fecha_ultimo_pago === hoy.toISOString().split('T')[0]) {
            // Rutinas de hoy van abajo
            const rutinaCard = card.cloneNode(true);
            rutinaCard.querySelector('.badge').className = "badge badge-active";
            rutinaCard.querySelector('.badge').innerText = "Hoy";
            rutinasDiv.appendChild(rutinaCard);
        } else if (c.plan_actual !== "Rutina") {
            if (diffDays < 0) {
                vencidosDiv.appendChild(card);
            } else if (diffDays <= 3) {
                porVencerDiv.appendChild(card);
            } else {
                activosDiv.appendChild(card);
            }
        }
    });
}

// Poblar Selects de Clientes
function populateClientesSelects() {
    const selectPago = document.getElementById('cliente-select');
    const selectAsistencia = document.getElementById('asistencia-cliente');
    const selectEdit = document.getElementById('edit-cliente-select');
    
    // Guardar selección actual
    const selPagoVal = selectPago.value;
    
    selectPago.innerHTML = '<option value="-- NUEVO CLIENTE --">-- NUEVO CLIENTE --</option>';
    selectAsistencia.innerHTML = '';
    selectEdit.innerHTML = '';
    
    // Ordenar clientes por nombre
    const clientesOrdenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    clientesOrdenados.forEach(c => {
        if (c.nombre === "CLIENTE CASUAL") return;
        
        const option = document.createElement('option');
        option.value = c.nombre;
        option.innerText = c.nombre;
        
        selectPago.appendChild(option.cloneNode(true));
        selectEdit.appendChild(option.cloneNode(true));
        
        // Para asistencia, solo los que tienen planes vigentes (aproximado en JS)
        if (["Semana", "Quincena", "Mensual"].includes(c.plan_actual)) {
            selectAsistencia.appendChild(option.cloneNode(true));
        }
    });
    
    selectPago.value = selPagoVal;
}

// Manejo de formulario de pago
const clienteSelect = document.getElementById('cliente-select');
const nuevoClienteFields = document.getElementById('nuevo-cliente-fields');

clienteSelect.addEventListener('change', () => {
    if (clienteSelect.value === "-- NUEVO CLIENTE --") {
        nuevoClienteFields.style.display = 'block';
        document.getElementById('pago-telefono').value = '';
    } else {
        nuevoClienteFields.style.display = 'none';
        const cliente = clientes.find(c => c.nombre === clienteSelect.value);
        if (cliente) {
            document.getElementById('pago-telefono').value = cliente.telefono ? cliente.telefono.slice(-10) : '';
        }
    }
});

document.getElementById('pago-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const isNuevo = clienteSelect.value === "-- NUEVO CLIENTE --";
    const nombre = isNuevo ? document.getElementById('nuevo-nombre').value : clienteSelect.value;
    const telefono = document.getElementById('pago-telefono').value;
    const plan = document.getElementById('pago-plan').value;
    const entrenadora = document.getElementById('pago-entrenadora').checked;
    const metodo = document.getElementById('pago-metodo').value;
    
    if (!nombre) {
        alert("El nombre es obligatorio");
        return;
    }
    
    const telefonoNorm = telefono.length === 10 ? "57" + telefono : telefono;
    
    // Calcular vencimiento
    const hoy = new Date();
    let vencimiento = new Date();
    if (plan === "Rutina") vencimiento = hoy;
    if (plan === "Semana") vencimiento.setDate(hoy.getDate() + 6);
    if (plan === "Quincena") vencimiento.setDate(hoy.getDate() + 14);
    if (plan === "Mensual") vencimiento.setMonth(hoy.getMonth() + 1);
    
    const fechaUltimoPago = hoy.toISOString().split('T')[0];
    const fechaVencimiento = vencimiento.toISOString().split('T')[0];
    
    let clienteId = null;
    
    if (isNuevo) {
        // Insertar cliente
        const res = await supabaseRequest("POST", "clientes", {}, {
            nombre: nombre,
            telefono: telefonoNorm,
            fecha_ultimo_pago: fechaUltimoPago,
            fecha_vencimiento: fechaVencimiento,
            plan_actual: plan,
            con_entrenadora: entrenadora
        });
        if (res && res.length > 0) clienteId = res[0].id;
    } else {
        // Actualizar cliente
        const cliente = clientes.find(c => c.nombre === nombre);
        if (cliente) {
            clienteId = cliente.id;
            await supabaseRequest("PATCH", "clientes", { "id": `eq.${clienteId}` }, {
                telefono: telefonoNorm,
                fecha_ultimo_pago: fechaUltimoPago,
                fecha_vencimiento: fechaVencimiento,
                plan_actual: plan,
                con_entrenadora: entrenadora
            });
        }
    }
    
    if (clienteId) {
        // Registrar pago
        const categoria = entrenadora ? "Con Entrenadora" : "Normal";
        const monto = tarifas[categoria][plan];
        
        await supabaseRequest("POST", "pagos", {}, {
            cliente_id: clienteId,
            monto: monto,
            fecha: fechaUltimoPago,
            plan_tipo: plan,
            metodo_pago: metodo,
            con_entrenadora: entrenadora
        });
        
        alert("Pago registrado con éxito");
        await loadAllData();
        document.getElementById('pago-form').reset();
        nuevoClienteFields.style.display = 'block';
    }
});

// Cargar Asistencia Hoy
async function loadAsistenciaHoy() {
    const hoy = new Date().toISOString().split('T')[0];
    const params = {
        "fecha": `gte.${hoy}T00:00:00`,
        "select": "fecha,clientes!inner(nombre)"
    };
    const res = await supabaseRequest("GET", "asistencia", params);
    
    const tablaDiv = document.getElementById('tabla-asistencia-hoy');
    if (res && res.length > 0) {
        let html = `
            <div class="custom-table-container">
                <table class="custom-table">
                    <thead>
                        <tr><th>Nombre</th><th>Día</th><th>Hora</th></tr>
                    </thead>
                    <tbody>
        `;
        res.forEach(r => {
            const dt = new Date(r.fecha);
            html += `
                <tr>
                    <td>${r.clientes.nombre}</td>
                    <td>${dt.toLocaleDateString()}</td>
                    <td>${dt.toLocaleTimeString()}</td>
                </tr>
            `;
        });
        html += "</tbody></table></div>";
        tablaDiv.innerHTML = html;
    } else {
        tablaDiv.innerHTML = "<p>No hay asistencia registrada hoy.</p>";
    }
}

// Registrar Asistencia
document.getElementById('asistencia-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('asistencia-cliente').value;
    const cliente = clientes.find(c => c.nombre === nombre);
    
    if (cliente) {
        await supabaseRequest("POST", "asistencia", {}, {
            cliente_id: cliente.id
        });
        alert(`Asistencia registrada para ${nombre}`);
        await loadAsistenciaHoy();
    }
});

// Cargar Métricas
async function loadMetrics() {
    const hoy = new Date().toISOString().split('T')[0];
    
    // Ingresos Hoy
    const resHoy = await supabaseRequest("GET", "pagos", { "fecha": `eq.${hoy}`, "select": "monto" });
    const totalHoy = resHoy ? resHoy.reduce((acc, curr) => acc + curr.monto, 0) : 0;
    document.getElementById('metric-hoy').innerText = `$${totalHoy.toLocaleString()}`;
    
    // Esta Semana (Aproximado en JS)
    const hoyDate = new Date();
    const dayOfWeek = hoyDate.getDay(); // 0 is Sunday
    const diff = hoyDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    const startOfWeek = new Date(hoyDate.setDate(diff)).toISOString().split('T')[0];
    
    const resSemana = await supabaseRequest("GET", "pagos", { "fecha": `gte.${startOfWeek}`, "select": "monto" });
    const totalSemana = resSemana ? resSemana.reduce((acc, curr) => acc + curr.monto, 0) : 0;
    document.getElementById('metric-semana').innerText = `$${totalSemana.toLocaleString()}`;
    
    // Este Mes
    const startOfMonth = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1).toISOString().split('T')[0];
    const resMes = await supabaseRequest("GET", "pagos", { "fecha": `gte.${startOfMonth}`, "select": "monto" });
    const totalMes = resMes ? resMes.reduce((acc, curr) => acc + curr.monto, 0) : 0;
    document.getElementById('metric-mes').innerText = `$${totalMes.toLocaleString()}`;
}

// Cargar Historial de Pagos
async function loadHistorialPagos() {
    const params = {
        "select": "fecha,monto,plan_tipo,metodo_pago,con_entrenadora,clientes!inner(nombre)",
        "order": "fecha.desc"
    };
    const res = await supabaseRequest("GET", "pagos", params);
    const container = document.getElementById('historial-pagos-container');
    
    if (res && res.length > 0) {
        let html = `
            <div class="custom-table-container">
                <table class="custom-table">
                    <thead>
                        <tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Plan</th><th>Método</th><th>Entrenadora</th></tr>
                    </thead>
                    <tbody>
        `;
        res.forEach(r => {
            html += `
                <tr>
                    <td>${r.fecha}</td>
                    <td>${r.clientes.nombre}</td>
                    <td>$${r.monto.toLocaleString()}</td>
                    <td>${r.plan_tipo}</td>
                    <td>${r.metodo_pago}</td>
                    <td>${r.con_entrenadora ? "Sí" : "No"}</td>
                </tr>
            `;
        });
        html += "</tbody></table></div>";
        container.innerHTML = html;
    } else {
        container.innerHTML = "<p>No hay historial de pagos.</p>";
    }
}

// Cargar Historial de Asistencia
async function loadHistorialAsistencia() {
    const params = {
        "select": "fecha,clientes!inner(nombre)",
        "order": "fecha.desc"
    };
    const res = await supabaseRequest("GET", "asistencia", params);
    const container = document.getElementById('historial-asistencia-container');
    
    if (res && res.length > 0) {
        let html = `
            <div class="custom-table-container">
                <table class="custom-table">
                    <thead>
                        <tr><th>Nombre</th><th>Día</th><th>Hora</th></tr>
                    </thead>
                    <tbody>
        `;
        res.forEach(r => {
            const dt = new Date(r.fecha);
            html += `
                <tr>
                    <td>${r.clientes.nombre}</td>
                    <td>${dt.toLocaleDateString()}</td>
                    <td>${dt.toLocaleTimeString()}</td>
                </tr>
            `;
        });
        html += "</tbody></table></div>";
        container.innerHTML = html;
    } else {
        container.innerHTML = "<p>No hay historial de asistencia.</p>";
    }
}

// Inicializar la app (Cargar datos si ya estuviera logueado, pero aquí forzamos login primero)
// Podríamos implementar persistencia con localStorage si quisiéramos.
