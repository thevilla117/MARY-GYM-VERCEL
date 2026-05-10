const SUPABASE_URL = "https://zmvrfdtacxdudjmiswka.supabase.co";
const SUPABASE_KEY = "sb_publishable__w3Thfledx3ORdNHxCigrw_WjyShcDg";
let currentUser = null, userRole = null, clientes = [];
let tarifas = {"Normal":{"Rutina":5000,"Semana":20000,"Quincena":40000,"Mensual":60000},"Con Entrenadora":{"Rutina":10000,"Semana":30000,"Quincena":60000,"Mensual":100000}};
const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

async function hashPassword(p){const e=new TextEncoder();const d=e.encode(p);const h=await crypto.subtle.digest('SHA-256',d);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');}

async function supabaseRequest(method,table,params={},jsonData=null){
    let url=`${SUPABASE_URL}/rest/v1/${table}`;
    const qp=new URLSearchParams();
    for(const[k,v]of Object.entries(params))qp.append(k,v);
    if(qp.toString())url+=`?${qp.toString()}`;
    const headers={"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"};
    if(method==="POST"||method==="PATCH")headers["Prefer"]="return=representation";
    const opts={method,headers};
    if(jsonData)opts.body=JSON.stringify(jsonData);
    try{const r=await fetch(url,opts);if(!r.ok){console.error(`Supabase error: ${r.status}`);return[];}if(r.status===204)return[];return await r.json();}
    catch(e){console.error("Connection error:",e);return[];}
}

// LOGIN
loginForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const u=document.getElementById('username').value;
    const p=document.getElementById('password').value;
    const h=await hashPassword(p);
    const res=await supabaseRequest("GET","usuarios",{"username":`eq.${u}`,"password":`eq.${h}`,"select":"username,rol"});
    if(res&&res.length>0){
        currentUser=res[0].username;userRole=res[0].rol;
        if(userRole==='super_admin')document.getElementById('tab-config').style.display='inline-flex';
        loginScreen.style.display='none';mainContent.style.display='block';
        await loadAllData();
    }else{loginError.style.display='block';}
});
logoutBtn.addEventListener('click',()=>{currentUser=null;userRole=null;loginScreen.style.display='block';mainContent.style.display='none';loginForm.reset();loginError.style.display='none';document.getElementById('tab-config').style.display='none';});

// TABS
tabButtons.forEach(btn=>{btn.addEventListener('click',()=>{
    const tabId=btn.getAttribute('data-tab');
    tabButtons.forEach(b=>b.classList.remove('active'));tabContents.forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');document.getElementById(tabId).classList.add('active');
    if(tabId==='dashboard')loadClientes();
    if(tabId==='asistencia')loadAsistenciaHoy();
    if(tabId==='historial')loadHistorialPagos();
    if(tabId==='hist-asistencia')loadHistorialAsistencia();
    if(tabId==='configuracion')loadUsuarios();
});});

async function loadAllData(){await loadTarifas();await loadClientes();await loadMetrics();await loadAsistenciaHoy();populateClientesSelects();}

// TARIFAS
async function loadTarifas(){
    const res=await supabaseRequest("GET","tarifas",{"select":"categoria,plan_tipo,monto"});
    if(res&&res.length>0)res.forEach(r=>{if(tarifas[r.categoria])tarifas[r.categoria][r.plan_tipo]=r.monto;});
    renderTarifas();fillTarifasInputs();
}
function renderTarifas(){
    const d=document.getElementById('tarifas-display');
    let h='<div class="tarifas-container"><div class="tarifa-column"><h3>Plan Normal</h3>';
    for(const[p,m]of Object.entries(tarifas["Normal"]))h+=`<div class="tarifa-item"><span>${p}</span><span>$${m.toLocaleString()}</span></div>`;
    h+='</div><div class="tarifa-column"><h3>Con Entrenadora</h3>';
    for(const[p,m]of Object.entries(tarifas["Con Entrenadora"]))h+=`<div class="tarifa-item"><span>${p}</span><span>$${m.toLocaleString()}</span></div>`;
    h+='</div></div>';d.innerHTML=h;
}
function fillTarifasInputs(){
    ["Rutina","Semana","Quincena","Mensual"].forEach(p=>{
        const ni=document.getElementById(`tn-${p.toLowerCase()}`);const ei=document.getElementById(`te-${p.toLowerCase()}`);
        if(ni)ni.value=tarifas["Normal"][p];if(ei)ei.value=tarifas["Con Entrenadora"][p];
    });
}

// CLIENTES
async function loadClientes(){
    const res=await supabaseRequest("GET","clientes",{"nombre":"neq.CLIENTE CASUAL","or":"(borrado.is.null,borrado.eq.false)","select":"*"});
    clientes=res||[];renderDashboard();populateClientesSelects();
}
function renderDashboard(){
    const aDiv=document.getElementById('clientes-activos'),pDiv=document.getElementById('clientes-por-vencer'),vDiv=document.getElementById('clientes-vencidos'),rDiv=document.getElementById('rutinas-hoy');
    aDiv.innerHTML='';pDiv.innerHTML='';vDiv.innerHTML='';rDiv.innerHTML='';
    const hoy=new Date();hoy.setHours(0,0,0,0);
    const sorted=[...clientes].sort((a,b)=>{const da=new Date(a.fecha_vencimiento),db=new Date(b.fecha_vencimiento);return da-db;});
    sorted.forEach(c=>{
        const venc=new Date(c.fecha_vencimiento);venc.setHours(0,0,0,0);
        const diff=Math.ceil((venc-hoy)/(1000*60*60*24));
        const isRutina=c.plan_actual==="Rutina";
        const isRutinaHoy=isRutina&&c.fecha_ultimo_pago===hoy.toISOString().split('T')[0];
        if(isRutina&&isRutinaHoy){
            rDiv.innerHTML+=`<div class="client-card"><div><div class="client-name">${c.nombre}</div><div class="badge-plan">RUTINA</div></div><div><span class="badge badge-active">Hoy</span></div></div>`;
            return;
        }
        if(isRutina)return;
        let badge,bclass,dtext;
        if(diff<0){badge="Vencido";bclass="badge-expired";dtext=`${Math.abs(diff)} días`;}
        else if(diff<=3){badge="Alerta";bclass="badge-warning";dtext=`${diff} días`;}
        else{badge="Activo";bclass="badge-active";dtext=`${diff} días`;}
        const vLabel=diff<0?"Venció":"Vence";
        let card=`<div class="client-card"><div><div class="client-name">${c.nombre}</div><div class="badge-plan">${c.plan_actual||'Plan'}</div><div class="client-info">${vLabel}: <span class="highlight">${c.fecha_vencimiento}</span> <span class="days-badge">${dtext}</span></div>`;
        if(diff<=3&&c.telefono){
            const tel=c.telefono.replace(/\D/g,'');
            const msg=diff<0?`Hola ${c.nombre}, tu plan en MARY'S GYM ya venció. Te invitamos a renovarlo. ¡Gracias!`:`Hola ${c.nombre}, te recordamos que tu plan en MARY'S GYM está por vencer. ¡Te esperamos!`;
            card+=`<div style="text-align:right;margin-top:5px;"><a href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}" target="_blank" class="wa-link"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></div>`;
        }
        card+=`</div><div><span class="badge ${bclass}">${badge}</span></div></div>`;
        if(diff<0)vDiv.innerHTML+=card;else if(diff<=3)pDiv.innerHTML+=card;else aDiv.innerHTML+=card;
    });
    if(!rDiv.innerHTML)rDiv.innerHTML='<p style="color:#A8B5C7;">No hay clientes con plan de Rutina registrados hoy.</p>';
}

function populateClientesSelects(){
    const sP=document.getElementById('cliente-select'),sA=document.getElementById('asistencia-cliente'),sE=document.getElementById('edit-cliente-select');
    const selVal=sP.value;
    sP.innerHTML='<option value="-- NUEVO CLIENTE --">-- NUEVO CLIENTE --</option>';sA.innerHTML='';sE.innerHTML='';
    const ord=[...clientes].sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const planesLargos=ord.filter(c=>["Semana","Quincena","Mensual"].includes(c.plan_actual));
    ord.forEach(c=>{
        sP.innerHTML+=`<option value="${c.nombre}">${c.nombre}</option>`;
    });
    planesLargos.forEach(c=>{
        sE.innerHTML+=`<option value="${c.nombre}">${c.nombre}</option>`;
    });
    // Asistencia: solo planes largos que NO asistieron hoy (se filtra en loadAsistenciaHoy)
    sP.value=selVal;
}

// PAGO
const clienteSelect=document.getElementById('cliente-select');
const nuevoFields=document.getElementById('nuevo-cliente-fields');
const renovandoInfo=document.getElementById('renovando-info');
clienteSelect.addEventListener('change',()=>{
    if(clienteSelect.value==="-- NUEVO CLIENTE --"){
        nuevoFields.style.display='block';renovandoInfo.style.display='none';
        document.getElementById('pago-telefono').value='';
    }else{
        nuevoFields.style.display='none';renovandoInfo.style.display='block';
        document.getElementById('renovando-nombre').innerText=clienteSelect.value;
        const cl=clientes.find(c=>c.nombre===clienteSelect.value);
        if(cl)document.getElementById('pago-telefono').value=cl.telefono?cl.telefono.slice(-10):'';
    }
});

document.getElementById('pago-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const isNuevo=clienteSelect.value==="-- NUEVO CLIENTE --";
    const nombre=isNuevo?document.getElementById('nuevo-nombre').value:clienteSelect.value;
    const telefono=document.getElementById('pago-telefono').value;
    const plan=document.getElementById('pago-plan').value;
    const entrenadora=document.getElementById('pago-entrenadora').checked;
    const metodo=document.getElementById('pago-metodo').value;
    if(!nombre){alert("Por favor completa el nombre.");return;}
    if(telefono&&telefono.length!==10){alert("El teléfono debe tener 10 dígitos.");return;}
    const telNorm=telefono.length===10?"57"+telefono:telefono;
    const hoy=new Date();let venc=new Date(hoy);
    if(plan==="Rutina")venc=new Date(hoy);
    if(plan==="Semana")venc.setDate(hoy.getDate()+6);
    if(plan==="Quincena")venc.setDate(hoy.getDate()+14);
    if(plan==="Mensual"){venc.setMonth(hoy.getMonth()+1);venc.setDate(venc.getDate()-1);}
    const fPago=hoy.toISOString().split('T')[0],fVenc=venc.toISOString().split('T')[0];
    let clienteId=null;
    // Buscar si existe
    const existing=await supabaseRequest("GET","clientes",{"nombre":`eq.${nombre}`,"select":"id"});
    if(existing&&existing.length>0){
        clienteId=existing[0].id;
        await supabaseRequest("PATCH","clientes",{"id":`eq.${clienteId}`},{telefono:telNorm,fecha_ultimo_pago:fPago,fecha_vencimiento:fVenc,plan_actual:plan,con_entrenadora:entrenadora});
    }else{
        const res=await supabaseRequest("POST","clientes",{},{nombre,telefono:telNorm,fecha_ultimo_pago:fPago,fecha_vencimiento:fVenc,plan_actual:plan,con_entrenadora:entrenadora});
        if(res&&res.length>0)clienteId=res[0].id;
    }
    if(clienteId){
        const cat=entrenadora?"Con Entrenadora":"Normal";
        await supabaseRequest("POST","pagos",{},{cliente_id:clienteId,monto:tarifas[cat][plan],fecha:fPago,plan_tipo:plan,metodo_pago:metodo,con_entrenadora:entrenadora});
        alert(`¡Pago registrado para ${nombre}!`);
        await loadAllData();document.getElementById('pago-form').reset();nuevoFields.style.display='block';renovandoInfo.style.display='none';
    }
});

// ASISTENCIA
async function loadAsistenciaHoy(){
    const hoy=new Date().toISOString().split('T')[0];
    const res=await supabaseRequest("GET","asistencia",{"fecha":`gte.${hoy}T00:00:00`,"select":"fecha,clientes!inner(nombre)"});
    const tablaDiv=document.getElementById('tabla-asistencia-hoy');
    const asistidosHoy=res?res.map(r=>r.clientes.nombre):[];
    // Actualizar select de asistencia: solo planes largos que NO asistieron hoy
    const sA=document.getElementById('asistencia-cliente');sA.innerHTML='';
    const planesLargos=clientes.filter(c=>["Semana","Quincena","Mensual"].includes(c.plan_actual));
    const porAsistir=planesLargos.filter(c=>!asistidosHoy.includes(c.nombre));
    porAsistir.sort((a,b)=>a.nombre.localeCompare(b.nombre));
    porAsistir.forEach(c=>{sA.innerHTML+=`<option value="${c.nombre}">${c.nombre}</option>`;});
    if(porAsistir.length===0&&planesLargos.length>0){
        sA.innerHTML='<option value="">¡Todos ya registraron asistencia!</option>';
    }
    if(res&&res.length>0){
        let h='<div class="custom-table-container"><table class="custom-table"><thead><tr><th>Nombre</th><th>Día</th><th>Hora</th></tr></thead><tbody>';
        res.forEach(r=>{const dt=new Date(r.fecha);h+=`<tr><td>${r.clientes.nombre}</td><td>${dt.toLocaleDateString()}</td><td>${dt.toLocaleTimeString()}</td></tr>`;});
        h+='</tbody></table></div>';tablaDiv.innerHTML=h;
    }else{tablaDiv.innerHTML='<p style="color:#A8B5C7;">No hay asistencia registrada hoy.</p>';}
}
document.getElementById('asistencia-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const nombre=document.getElementById('asistencia-cliente').value;
    if(!nombre||nombre==='¡Todos ya registraron asistencia!')return;
    const cl=clientes.find(c=>c.nombre===nombre);
    if(cl){
        // Check if already registered today
        const hoy=new Date().toISOString().split('T')[0];
        const check=await supabaseRequest("GET","asistencia",{"cliente_id":`eq.${cl.id}`,"fecha":`gte.${hoy}T00:00:00`,"select":"id"});
        if(!check||check.length===0){
            await supabaseRequest("POST","asistencia",{},{cliente_id:parseInt(cl.id)});
            alert(`¡Asistencia registrada para ${nombre}!`);
        }else{alert(`${nombre} ya registró asistencia hoy.`);}
        await loadAsistenciaHoy();
    }
});

// MÉTRICAS
async function loadMetrics(){
    const hoy=new Date();const hoyStr=hoy.toISOString().split('T')[0];
    const rH=await supabaseRequest("GET","pagos",{"fecha":`eq.${hoyStr}`,"select":"monto"});
    document.getElementById('metric-hoy').innerText=`$${(rH?rH.reduce((a,c)=>a+c.monto,0):0).toLocaleString()}`;
    const dow=hoy.getDay();const diff2=hoy.getDate()-dow+(dow===0?-6:1);
    const sow=new Date(hoy.getFullYear(),hoy.getMonth(),diff2).toISOString().split('T')[0];
    const rS=await supabaseRequest("GET","pagos",{"fecha":`gte.${sow}`,"select":"monto"});
    document.getElementById('metric-semana').innerText=`$${(rS?rS.reduce((a,c)=>a+c.monto,0):0).toLocaleString()}`;
    const som=new Date(hoy.getFullYear(),hoy.getMonth(),1).toISOString().split('T')[0];
    const rM=await supabaseRequest("GET","pagos",{"fecha":`gte.${som}`,"select":"monto"});
    document.getElementById('metric-mes').innerText=`$${(rM?rM.reduce((a,c)=>a+c.monto,0):0).toLocaleString()}`;
}

// HISTORIAL PAGOS (agrupado por mes con expandibles)
const mesesEs=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
async function loadHistorialPagos(){
    const res=await supabaseRequest("GET","pagos",{"select":"fecha,monto,plan_tipo,metodo_pago,con_entrenadora,clientes!inner(nombre)","order":"fecha.desc"});
    const container=document.getElementById('historial-pagos-container');
    if(!res||res.length===0){container.innerHTML='<p style="color:#A8B5C7;">No hay historial de pagos.</p>';return;}
    const grupos={};const now=new Date();
    res.forEach(r=>{const d=new Date(r.fecha);const key=`${d.getFullYear()}-${d.getMonth()}`;if(!grupos[key])grupos[key]={ano:d.getFullYear(),mes:d.getMonth(),items:[]};grupos[key].items.push(r);});
    let html='';
    for(const key of Object.keys(grupos)){
        const g=grupos[key];const isCurrentMonth=(g.ano===now.getFullYear()&&g.mes===now.getMonth());
        html+=`<div class="expander-container"><div class="expander-header ${isCurrentMonth?'open':''}" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open');"><span>Mes: ${mesesEs[g.mes]} ${g.ano}</span><span class="arrow">▼</span></div>`;
        html+=`<div class="expander-body ${isCurrentMonth?'open':''}"><div class="custom-table-container"><table class="custom-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Plan</th><th>Método</th><th>Entrenadora</th></tr></thead><tbody>`;
        g.items.forEach(r=>{html+=`<tr><td>${r.fecha}</td><td>${r.clientes.nombre}</td><td>$${parseInt(r.monto).toLocaleString()}</td><td>${r.plan_tipo||''}</td><td>${r.metodo_pago||''}</td><td>${r.con_entrenadora?'Sí':'No'}</td></tr>`;});
        html+='</tbody></table></div></div></div>';
    }
    container.innerHTML=html;
}

// HISTORIAL ASISTENCIA (agrupado por mes)
async function loadHistorialAsistencia(){
    const res=await supabaseRequest("GET","asistencia",{"select":"fecha,clientes!inner(nombre)","order":"fecha.desc"});
    const container=document.getElementById('historial-asistencia-container');
    if(!res||res.length===0){container.innerHTML='<p style="color:#A8B5C7;">No hay historial de asistencia.</p>';return;}
    const grupos={};const now=new Date();
    res.forEach(r=>{const d=new Date(r.fecha);const key=`${d.getFullYear()}-${d.getMonth()}`;if(!grupos[key])grupos[key]={ano:d.getFullYear(),mes:d.getMonth(),items:[]};grupos[key].items.push(r);});
    let html='';
    for(const key of Object.keys(grupos)){
        const g=grupos[key];const isCurrentMonth=(g.ano===now.getFullYear()&&g.mes===now.getMonth());
        html+=`<div class="expander-container"><div class="expander-header ${isCurrentMonth?'open':''}" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open');"><span>Mes: ${mesesEs[g.mes]} ${g.ano}</span><span class="arrow">▼</span></div>`;
        html+=`<div class="expander-body ${isCurrentMonth?'open':''}"><div class="custom-table-container"><table class="custom-table"><thead><tr><th>Nombre</th><th>Día</th><th>Hora</th></tr></thead><tbody>`;
        g.items.forEach(r=>{const dt=new Date(r.fecha);html+=`<tr><td>${r.clientes.nombre}</td><td>${dt.toLocaleDateString()}</td><td>${dt.toLocaleTimeString()}</td></tr>`;});
        html+='</tbody></table></div></div></div>';
    }
    container.innerHTML=html;
}

// GESTIONAR - Edit
const editSelect=document.getElementById('edit-cliente-select');
const deleteMontoInput=document.getElementById('delete-monto');
let currentLastPagoId=null;
editSelect.addEventListener('change',async()=>{
    const cl=clientes.find(c=>c.nombre===editSelect.value);
    if(cl){
        document.getElementById('edit-nombre').value=cl.nombre;
        document.getElementById('edit-telefono').value=cl.telefono?cl.telefono.slice(-10):'';
        document.getElementById('edit-vencimiento').value=cl.fecha_vencimiento;
        const plans=["Rutina","Semana","Quincena","Mensual"];
        document.getElementById('edit-plan').value=plans.includes(cl.plan_actual)?cl.plan_actual:'Rutina';
        const pagos=await supabaseRequest("GET","pagos",{"cliente_id":`eq.${cl.id}`,"select":"id,monto,notas","order":"id.desc","limit":"1"});
        if(pagos&&pagos.length>0){deleteMontoInput.value=pagos[0].monto;currentLastPagoId=pagos[0].id;}
        else{deleteMontoInput.value=0;currentLastPagoId=null;}
    }
});
document.getElementById('edit-cliente-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const cl=clientes.find(c=>c.nombre===editSelect.value);
    if(!cl)return;
    const nn=document.getElementById('edit-nombre').value;
    const nt=document.getElementById('edit-telefono').value;
    if(!nn){alert("El nombre no puede estar vacío.");return;}
    if(nt&&nt.length!==10){alert("El teléfono debe tener 10 dígitos.");return;}
    const telNorm=nt.length===10?"57"+nt:nt;
    await supabaseRequest("PATCH","clientes",{"id":`eq.${cl.id}`},{nombre:nn,telefono:telNorm,fecha_vencimiento:document.getElementById('edit-vencimiento').value,plan_actual:document.getElementById('edit-plan').value});
    alert(`¡Datos de ${nn} actualizados!`);await loadClientes();
});
document.getElementById('delete-cliente-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const cl=clientes.find(c=>c.nombre===editSelect.value);
    if(!cl)return;
    await supabaseRequest("PATCH","clientes",{"id":`eq.${cl.id}`},{borrado:true});
    if(currentLastPagoId){
        await supabaseRequest("PATCH","pagos",{"id":`eq.${currentLastPagoId}`},{monto:parseFloat(deleteMontoInput.value),notas:document.getElementById('delete-motivo').value});
    }
    alert(`¡Cliente ${cl.nombre} eliminado y pago ajustado!`);
    await loadClientes();document.getElementById('delete-cliente-form').reset();
});

// CONFIGURACIÓN
document.getElementById('user-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    const u=document.getElementById('new-username').value,p=document.getElementById('new-password').value,r=document.getElementById('new-rol').value;
    if(!u||!p){alert("Todos los campos son obligatorios.");return;}
    const h=await hashPassword(p);
    const res=await supabaseRequest("POST","usuarios",{},{username:u,password:h,rol:r});
    if(res&&res.length>0){alert(`¡Usuario ${u} creado con éxito!`);document.getElementById('user-form').reset();}
    else alert("Error al crear usuario (puede que ya exista).");
});
async function loadUsuarios(){
    const res=await supabaseRequest("GET","usuarios",{"select":"username,rol"});
    const c=document.getElementById('tabla-usuarios');
    if(res&&res.length>0){
        let h='<div class="custom-table-container"><table class="custom-table"><thead><tr><th>Usuario</th><th>Rol</th></tr></thead><tbody>';
        res.forEach(r=>{h+=`<tr><td>${r.username}</td><td>${r.rol}</td></tr>`;});
        h+='</tbody></table></div>';c.innerHTML=h;
    }else c.innerHTML='<p style="color:#A8B5C7;">No hay usuarios.</p>';
}
document.getElementById('tarifas-normal-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    for(const p of["Rutina","Semana","Quincena","Mensual"]){
        const m=parseFloat(document.getElementById(`tn-${p.toLowerCase()}`).value);
        await supabaseRequest("PATCH","tarifas",{"categoria":"eq.Normal","plan_tipo":`eq.${p}`},{monto:m});
    }
    alert("¡Tarifas normales actualizadas!");await loadTarifas();
});
document.getElementById('tarifas-entrenadora-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    for(const p of["Rutina","Semana","Quincena","Mensual"]){
        const m=parseFloat(document.getElementById(`te-${p.toLowerCase()}`).value);
        await supabaseRequest("PATCH","tarifas",{"categoria":"eq.Con Entrenadora","plan_tipo":`eq.${p}`},{monto:m});
    }
    alert("¡Tarifas con entrenadora actualizadas!");await loadTarifas();
});
