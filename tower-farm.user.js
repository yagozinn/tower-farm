// ==UserScript==
// @name         Tower of Mages - Farm Automático
// @namespace    tower-farm
// @version      2.1.1
// @description  Farm automático da Torre Infinita com loot, chefões, inventário e empilhamento de gemas.
// @match        https://towerofmages.online/*
// @updateURL    https://raw.githubusercontent.com/yagozinn/tower-farm/main/tower-farm.user.js
// @downloadURL  https://raw.githubusercontent.com/yagozinn/tower-farm/main/tower-farm.user.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      towerfarm-license.yagohissa.workers.dev
// ==/UserScript==

(function () {
'use strict';

// ============================================================
// LICENÇA PREMIUM
// ============================================================
const LICENSE_API_URL = 'https://towerfarm-license.yagohissa.workers.dev/validate';
const LICENSE_KEY_STORAGE = 'towerFarm.license.key.v1';
const LICENSE_DEVICE_STORAGE = 'towerFarm.license.deviceId.v1';
const LICENSE_CHECK_INTERVAL_MS = 60 * 1000;
let licenseActive = false;
let licensePanelBuilt = false;
let licenseCheckTimer = null;

function normalizeLicenseKey(value) {
return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function makeDeviceId() {
try { if (crypto?.randomUUID) return `TFD-${crypto.randomUUID()}`; } catch {}
const rnd = () => Math.random().toString(36).slice(2,10).toUpperCase();
return `TFD-${Date.now().toString(36).toUpperCase()}-${rnd()}-${rnd()}`;
}

function getDeviceId() {
let id = '';
try { id = localStorage.getItem(LICENSE_DEVICE_STORAGE) || ''; } catch {}
if (!id) {
id = makeDeviceId();
try { localStorage.setItem(LICENSE_DEVICE_STORAGE, id); } catch {}
}
return id;
}

function getSavedLicenseKey() {
try { return normalizeLicenseKey(localStorage.getItem(LICENSE_KEY_STORAGE) || ''); } catch { return ''; }
}

function saveLicenseKey(key) {
try { localStorage.setItem(LICENSE_KEY_STORAGE, normalizeLicenseKey(key)); } catch {}
}

function licenseRequest(payload) {
return new Promise((resolve, reject) => {
const body = JSON.stringify(payload);
if (typeof GM_xmlhttpRequest === 'function') {
GM_xmlhttpRequest({
method: 'POST',
url: LICENSE_API_URL,
headers: {'Content-Type': 'application/json'},
data: body,
timeout: 12000,
onload: (response) => {
let data = {};
try { data = JSON.parse(response.responseText || '{}'); }
catch { reject(new Error('Resposta inválida do servidor de licenças.')); return; }
resolve({ok: response.status >= 200 && response.status < 300, status: response.status, data});
},
ontimeout: () => reject(new Error('Tempo limite ao validar a licença.')),
onerror: () => reject(new Error('Não foi possível conectar ao servidor de licenças.'))
});
return;
}
fetch(LICENSE_API_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body})
.then(async response => ({ok: response.ok, status: response.status, data: await response.json()}))
.then(resolve).catch(reject);
});
}

async function validatePremiumLicense(key) {
const normalizedKey = normalizeLicenseKey(key);
if (!normalizedKey) return {valid:false, reason:'missing_key', message:'Digite sua chave de licença Premium.'};
try {
const result = await licenseRequest({key: normalizedKey, deviceId: getDeviceId()});
const data = result?.data || {};
if (result.ok && data.valid === true) return {...data, valid:true};
return {...data, valid:false, message:data.message || 'Licença não autorizada.'};
} catch (err) {
return {valid:false, reason:'network_error', message:err?.message || 'Falha de conexão com o servidor de licenças.'};
}
}

function formatLicenseDate(value) {
if (!value) return 'Permanente';
const date = new Date(value);
if (Number.isNaN(date.getTime())) return '—';
return date.toLocaleString('pt-BR');
}

function removeLicenseGate() {
document.getElementById('tower-farm-license-gate')?.remove();
document.getElementById('tower-farm-license-style')?.remove();
}

function stopPremiumBecauseLicense(message) {
licenseActive = false;
state.running = false;
state.acting = false;
state.forgeRunning = false;
state.forgeActing = false;
config.forgeJobActive = false;
try { saveConfig(); } catch {}
document.getElementById('tower-farm-panel')?.remove();
licensePanelBuilt = false;
showLicenseGate(message || 'Sua licença precisa ser validada novamente.');
}

function showLicenseGate(initialMessage = '') {
removeLicenseGate();
const style = document.createElement('style');
style.id = 'tower-farm-license-style';
style.textContent = `
#tower-farm-license-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,15,.72);backdrop-filter:blur(8px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc}
#tower-farm-license-gate *{box-sizing:border-box}
#tower-farm-license-gate .tflic-box{width:min(420px,calc(100vw - 32px));background:linear-gradient(160deg,#111827 0%,#080d18 72%);border:1px solid rgba(139,92,246,.42);border-radius:20px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.58),0 0 44px rgba(124,58,237,.13)}
#tower-farm-license-gate .tflic-brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
#tower-farm-license-gate .tflic-logo{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#7c3aed,#4f46e5);box-shadow:0 10px 30px rgba(124,58,237,.34);font-size:22px}
#tower-farm-license-gate .tflic-title{font-weight:900;letter-spacing:.6px;font-size:17px}
#tower-farm-license-gate .tflic-ver{color:#a78bfa;font-weight:800}
#tower-farm-license-gate .tflic-sub{font-size:11px;color:#94a3b8;margin-top:2px}
#tower-farm-license-gate .tflic-card{padding:15px;border-radius:14px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.16)}
#tower-farm-license-gate .tflic-head{font-size:15px;font-weight:850;margin-bottom:4px}
#tower-farm-license-gate .tflic-desc{font-size:12px;line-height:1.5;color:#94a3b8;margin-bottom:13px}
#tower-farm-license-gate .tflic-label{display:block;font-size:11px;font-weight:800;color:#cbd5e1;margin:0 0 6px}
#tower-farm-license-gate .tflic-input{width:100%;height:44px;border-radius:11px;border:1px solid #334155;background:#0b1220;color:#fff;padding:0 13px;outline:none;font-size:14px;font-weight:750;letter-spacing:.5px;text-transform:uppercase}
#tower-farm-license-gate .tflic-input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.12)}
#tower-farm-license-gate .tflic-btn{width:100%;height:44px;border:0;border-radius:11px;margin-top:11px;background:linear-gradient(90deg,#7c3aed,#8b5cf6 48%,#4f46e5);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 10px 24px rgba(124,58,237,.25)}
#tower-farm-license-gate .tflic-btn:disabled{opacity:.55;cursor:wait}
#tower-farm-license-gate .tflic-msg{display:none;margin-top:11px;padding:10px 11px;border-radius:10px;font-size:12px;line-height:1.45;border:1px solid transparent}
#tower-farm-license-gate .tflic-msg.err{display:block;color:#fecaca;background:rgba(127,29,29,.22);border-color:rgba(248,113,113,.24)}
#tower-farm-license-gate .tflic-msg.ok{display:block;color:#bbf7d0;background:rgba(20,83,45,.22);border-color:rgba(74,222,128,.23)}
#tower-farm-license-gate .tflic-device{margin-top:12px;padding-top:11px;border-top:1px solid rgba(148,163,184,.12);font-size:10px;color:#64748b;word-break:break-all}
`;
document.head.appendChild(style);
const gate = document.createElement('div');
gate.id = 'tower-farm-license-gate';
gate.innerHTML = `<div class="tflic-box"><div class="tflic-brand"><div class="tflic-logo">♜</div><div><div class="tflic-title">TOWER FARM <span class="tflic-ver">PREMIUM</span></div><div class="tflic-sub">v2.1 • Desenvolvido por L AURÃO</div></div></div><div class="tflic-card"><div class="tflic-head">Ativação necessária</div><div class="tflic-desc">Digite sua chave Premium para liberar o Tower Farm neste dispositivo.</div><label class="tflic-label" for="tflic-key">CHAVE DE LICENÇA</label><input id="tflic-key" class="tflic-input" autocomplete="off" spellcheck="false" placeholder="TF-XXXX-XXXX-XXXX"><button id="tflic-activate" class="tflic-btn" type="button">ATIVAR PREMIUM</button><div id="tflic-msg" class="tflic-msg"></div><div class="tflic-device">ID deste dispositivo: <span>${getDeviceId()}</span></div></div></div>`;
document.body.appendChild(gate);
const input = gate.querySelector('#tflic-key');
const button = gate.querySelector('#tflic-activate');
const msg = gate.querySelector('#tflic-msg');
input.value = getSavedLicenseKey();
function setMsg(text, type='err') { msg.className = `tflic-msg ${type}`; msg.textContent = text || ''; }
if (initialMessage) setMsg(initialMessage, initialMessage.startsWith('Validando') ? 'ok' : 'err');
async function activate() {
const key = normalizeLicenseKey(input.value);
input.value = key;
button.disabled = true;
button.textContent = 'VALIDANDO...';
setMsg('Validando licença com o servidor...', 'ok');
const result = await validatePremiumLicense(key);
if (result.valid) {
saveLicenseKey(key);
licenseActive = true;
setMsg(`Premium ativado. Validade: ${formatLicenseDate(result.expiresAt)}`, 'ok');
button.textContent = 'ATIVADO ✓';
setTimeout(() => { removeLicenseGate(); startPremiumAfterLicense(); }, 450);
return;
}
licenseActive = false;
button.disabled = false;
button.textContent = 'ATIVAR PREMIUM';
setMsg(result.message || 'Licença recusada.', 'err');
}
button.addEventListener('click', activate);
input.addEventListener('keydown', event => { if (event.key === 'Enter') activate(); });
setTimeout(() => input.focus(), 50);
}

async function revalidateRunningLicense() {
if (!licenseActive) return;
const result = await validatePremiumLicense(getSavedLicenseKey());
if (!result.valid) stopPremiumBecauseLicense(result.message || 'Licença inválida ou expirada.');
}

function armLicenseRevalidation() {
if (licenseCheckTimer) clearInterval(licenseCheckTimer);
licenseCheckTimer = setInterval(revalidateRunningLicense, LICENSE_CHECK_INTERVAL_MS);
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const STORAGE_KEY = 'towerFarm.config.v1';
const BOSS_STATE_KEY = 'towerFarm.bossState.v1';

const loadedConfig = loadConfig();

if (
typeof loadedConfig.sellRarity === 'string' &&
!Array.isArray(loadedConfig.sellRarities)
) {
loadedConfig.sellRarities = [loadedConfig.sellRarity];
}

delete loadedConfig.sellRarity;

if (
loadedConfig.mode === 'off' ||
loadedConfig.mode === 'always'
) {
loadedConfig.mode = 'subirTorre';
}

const DURACOES = [
'3 minutos',
'10 minutos',
'30 minutos',
'1 hora',
'3 horas',
'6 horas',
'12 horas'
];

const config = Object.assign(
{
mode: 'subirTorre',
duration: '3 minutos',
thresholdPercent: 70,
bossMode: true,
inventoryAction: 'vender',
sellRarities: ['Comum'],
protectCodex: false,
autoStackGems: true,
forgeItemName: '',
forgeItemKey: '',
forgeTargetLevel: 1,
forgePendingLoad: false
},
loadedConfig
);

if (!DURACOES.includes(config.duration)) {
config.duration = '3 minutos';
}

const state = {
running: false,
acting: false,
actingSince: 0,
lastLog: '',
repairedThisRest: false,
voluntaryExitAt: 0,
expeditionFloorBeforeBoss: null,
wasInExpedition: false,
needsMaintenance: false,
maintenanceRunning: false,
forgeRunning: false,
forgeActing: false
};

function loadConfig() {
try {
const raw = localStorage.getItem(STORAGE_KEY);
return raw ? JSON.parse(raw) : {};
} catch {
return {};
}
}

function saveConfig() {
try {
localStorage.setItem(
STORAGE_KEY,
JSON.stringify(config)
);
} catch {}
}

// ============================================================
// LEITURA DO DOM
// ============================================================

function normalizedText(el) {
return (el?.textContent || '')
.replace(/\s+/g, ' ')
.trim();
}

function clicaveisVisiveis() {
return [
...document.querySelectorAll(
'button, [role="button"], a'
)
].filter(
(el) =>
el.offsetParent !== null &&
getComputedStyle(el).visibility !== 'hidden'
);
}

function findClickableByText(target) {
const needle = String(target).toLowerCase();

return (
clicaveisVisiveis().find(
(el) =>
normalizedText(el)
.toLowerCase()
.includes(needle)
) || null
);
}

function soLetras(str) {
return String(str)
.normalize('NFKD')
.replace(/[^\p{L}\s]/gu, '')
.replace(/\s+/g, ' ')
.trim()
.toLowerCase();
}

function findExactClickableByText(target) {
const needle = soLetras(target);

return (
clicaveisVisiveis().find(
(el) =>
soLetras(normalizedText(el)) === needle
) || null
);
}

function findStartButton() {
return findClickableByText(
'Iniciar Expedição'
);
}

function findExitButton() {
return findClickableByText(
'Sair e levar tudo'
);
}

function findContinueButton() {
return findClickableByText(
'Continuar expedição'
);
}

function findDurationButton() {
const needle =
config.duration
.trim()
.toLowerCase();

return (
clicaveisVisiveis().find(
(el) =>
normalizedText(el)
.toLowerCase()
.startsWith(needle)
) || null
);
}

function getChanceConcluirDuracaoTexto() {
const m =
document.body.innerText.match(
/Chance de concluir\s*\(([^)]+)\)/i
);

return m ? m[1].trim() : null;
}

function getExpeditionPercent() {
const m =
document.body.innerText.match(
/([\d]+(?:[.,]\d+)?)\s*%\s*da expedição/i
);

return m
? parseFloat(m[1].replace(',', '.'))
: null;
}

function itemApareceuNoMarco() {
return document.body.innerText.includes(
'Novo neste marco:'
);
}

function getAndarAtualTexto() {
for (
const h2 of document.querySelectorAll('h2')
) {
const t = normalizedText(h2);

if (/^Andar\s+\d+$/i.test(t)) {
return t;
}
}

return null;
}

function getAndarAtualNumero() {
const texto =
getAndarAtualTexto();

if (!texto) return null;

const m =
texto.match(/\d+/);

return m
? parseInt(m[0], 10)
: null;
}

function getRecordeAtual() {
const m =
document.body.innerText.match(
/Recorde:\s*(\d+)/i
);

return m
? parseInt(m[1], 10)
: null;
}

function lerAndaresDeExpedicaoNaTela() {
const resultado = [];

for (
const el of clicaveisVisiveis()
) {
const spans =
[...el.querySelectorAll('span')];

const temRotuloAndar =
spans.some(
(sp) =>
soLetras(
normalizedText(sp)
) === 'andar'
);

if (!temRotuloAndar) continue;

for (
const sp of spans
) {
const t =
normalizedText(sp);

if (/^\d+$/.test(t)) {
resultado.push({
andar: parseInt(t, 10),
el,
bloqueado: !!el.disabled
});

break;
}
}
}

return resultado;
}

function maiorAndarDesbloqueadoNaTela() {
const desbloqueados =
lerAndaresDeExpedicaoNaTela()
.filter(
(a) => !a.bloqueado
);

if (!desbloqueados.length) {
return null;
}

return desbloqueados.reduce(
(max, cur) =>
cur.andar > max.andar
? cur
: max
);
}

function findSubirPaginaAndaresButton() {
return (
clicaveisVisiveis().find(
(el) =>
normalizedText(el) === '‹'
) ||
findExactClickableByText('Subir')
);
}

// ============================================================
// LOOT NO CHÃO
// ============================================================

function findLootSection() {
const titulo = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong')].find(el => el.offsetParent !== null && normalizedText(el).toLowerCase() === 'loot no chão');
if (!titulo) return null;

let atual = titulo.parentElement;

for (let i = 0; i < 8 && atual; i++, atual = atual.parentElement) {
const temContador = [...atual.querySelectorAll('*')].some(el => el.offsetParent !== null && /\b\d+\s*s\b/i.test(normalizedText(el)));

if (
temContador &&
normalizedText(atual).toLowerCase().includes('loot no chão')
) {
return atual;
}
}

return titulo.parentElement;
}

function getLootTimers() {
const section = findLootSection();

if (!section) return [];

return [...section.querySelectorAll('*')].filter(
el =>
el.offsetParent !== null &&
/^\d+\s*s$/i.test(normalizedText(el))
);
}

function findLootCardFromTimer(timer) {
if (
!timer ||
!timer.isConnected
) {
return null;
}

let atual = timer;

for (
let nivel = 0;
nivel < 8 && atual;
nivel++, atual = atual.parentElement
) {
const clicavel =
atual.closest(
'button,[role="button"],a,[onclick]'
);

if (
clicavel &&
clicavel.offsetParent !== null &&
!clicavel.disabled
) {
return clicavel;
}

const rect =
atual.getBoundingClientRect();

if (
rect.width >= 25 &&
rect.width <= 500 &&
rect.height >= 25 &&
rect.height <= 500
) {
const real =
document.elementFromPoint(
rect.left + rect.width / 2,
rect.top + rect.height / 2
);

if (real) {
return (
real.closest(
'button,[role="button"],a,[onclick]'
) ||
real
);
}
}
}

return timer;
}

function findLootCards() {
return [
...new Set(
getLootTimers()
.map(findLootCardFromTimer)
.filter(
el =>
el &&
el.offsetParent !== null
)
)
];
}

function clickLoot(el) {
if (
!el ||
!el.isConnected
) {
return false;
}

const rect =
el.getBoundingClientRect();

const x =
rect.left +
rect.width / 2;

const y =
rect.top +
rect.height / 2;

let target =
document.elementFromPoint(x, y) ||
el;

target =
target.closest(
'button,[role="button"],a,[onclick]'
) ||
target;

const opts = {
bubbles: true,
cancelable: true,
view: window,
clientX: x,
clientY: y,
buttons: 1
};

try {
target.scrollIntoView({
block: 'center',
inline: 'center'
});
} catch {}

try {
target.focus?.();
} catch {}

try {
target.dispatchEvent(
new PointerEvent(
'pointerdown',
{
...opts,
pointerId: 1,
pointerType: 'mouse',
isPrimary: true
}
)
);
} catch {}

try {
target.dispatchEvent(
new MouseEvent(
'mousedown',
opts
)
);
} catch {}

try {
target.dispatchEvent(
new PointerEvent(
'pointerup',
{
...opts,
buttons: 0,
pointerId: 1,
pointerType: 'mouse',
isPrimary: true
}
)
);
} catch {}

try {
target.dispatchEvent(
new MouseEvent(
'mouseup',
{
...opts,
buttons: 0
}
)
);

target.dispatchEvent(
new MouseEvent(
'click',
{
...opts,
buttons: 0
}
)
);
} catch {}

try {
target.click?.();
} catch {}

return true;
}

async function coletarLootNoChao() {
try {
if (!findLootSection()) {
return 0;
}

let coletados = 0;

for (
let tentativa = 0;
tentativa < 30;
tentativa++
) {
const timersAntes =
getLootTimers();

if (!timersAntes.length) {
break;
}

const cards =
findLootCards();

if (!cards.length) {
break;
}

const card =
cards[0];

const quantidadeAntes =
timersAntes.length;

log(
`💰 Tentando coletar loot: ${normalizedText(card) || 'item'}`
);

clickLoot(card);

const confirmou =
await waitFor(
() =>
!card.isConnected ||
getLootTimers().length <
quantidadeAntes,
1500
);

if (!confirmou) {
console.warn(
'[TowerFarm][Loot] Coleta não confirmada.',
card
);

break;
}

coletados++;

log(
`💰 Loot coletado com sucesso (${coletados}).`
);

await sleep(250);
}

if (coletados > 0) {
log(
`💰 Loot no chão: ${coletados} item(ns) coletado(s).`
);

await sleep(500);
}

return coletados;

} catch (err) {
console.error(
'[TowerFarm] Erro coletando loot:',
err
);

return 0;
}
}

// ============================================================
// EMPILHAMENTO DE GEMAS
// ============================================================

const GEMAS_TIPOS = [
{
nome: 'Gemas menores',
termos: [
'gema menor',
'gemas menores'
]
},
{
nome: 'Gemas grandes',
termos: [
'gema grande',
'gemas grandes'
]
},
{
nome: 'Gemas anciãs',
termos: [
'gema anciã',
'gemas anciãs',
'gema ancia',
'gemas ancias'
]
},
{
nome: 'Poeiras estelares',
termos: [
'poeira estelar',
'poeiras estelares'
]
}
];

function textoContemAlgum(
texto,
termos
) {
const t =
soLetras(texto);

return termos.some(
(termo) =>
t.includes(
soLetras(termo)
)
);
}

function encontrarOpcaoGema(tipo) {
const elementos = [
...document.querySelectorAll(
'button,[role="button"],a,label,div,span'
)
].filter(
(el) =>
el.offsetParent !== null
);

for (
const el of elementos
) {
const texto =
normalizedText(el);

if (!texto) continue;

if (
textoContemAlgum(
texto,
tipo.termos
)
) {
if (
el.matches(
'button,[role="button"],a'
)
) {
return el;
}

const clicavel =
el.closest(
'button,[role="button"],a,label'
);

if (
clicavel &&
clicavel.offsetParent !== null
) {
return clicavel;
}
}
}

return null;
}

function encontrarBotaoEmpilharConfirmar() {
const termos = [
'empilhar',
'empilhar gemas',
'confirmar',
'combinar'
];

return (
clicaveisVisiveis().find(
(el) => {
const texto =
soLetras(
normalizedText(el)
);

return termos.some(
(termo) =>
texto ===
soLetras(termo)
);
}
) || null
);
}

async function empilharGemas() {
if (!config.autoStackGems) return false;

try {
let botaoAbrir = findExactClickableByText('Empilhar Gemas');

if (!botaoAbrir) {
const santuarioBtn = findSantuarioButton();

if (santuarioBtn) {
simulateClick(santuarioBtn);
await sleep(450);

await waitFor(
() => !!findExactClickableByText('Empilhar Gemas'),
2200
);

botaoAbrir =
findExactClickableByText('Empilhar Gemas');
}
}

if (!botaoAbrir || botaoAbrir.disabled) {
return false;
}

log('💎 Verificando gemas/poeira...');

simulateClick(botaoAbrir);

await sleep(500);

const botaoEmpilhar =
clicaveisVisiveis().find(
(el) => {
const texto =
soLetras(normalizedText(el));

return (
texto === 'empilhar' &&
!el.disabled &&
el.getAttribute('aria-disabled') !== 'true' &&
getComputedStyle(el).pointerEvents !== 'none'
);
}
) || null;

let area =
botaoEmpilhar?.closest('[role="dialog"]') ||
null;

if (!area && botaoEmpilhar) {
let atual =
botaoEmpilhar.parentElement;

for (
let i = 0;
i < 8 && atual;
i++, atual = atual.parentElement
) {
const texto =
soLetras(normalizedText(atual));

if (
texto.includes('empilhar') &&
(
texto.includes('gema') ||
texto.includes('poeira')
)
) {
area = atual;
break;
}
}
}

const textoArea =
soLetras(
normalizedText(
area || document.body
)
);

const temMaterial =
/gema|poeira/.test(textoArea);

const indicaVazio =
textoArea.includes('nenhuma gema') ||
textoArea.includes('nenhum item') ||
textoArea.includes('nada para empilhar') ||
textoArea.includes('nenhuma combinacao') ||
textoArea.includes('nao ha');

let empilhou = false;

if (
botaoEmpilhar &&
temMaterial &&
!indicaVazio
) {
log(
'💎 Material pronto — empilhando...'
);

simulateClick(
botaoEmpilhar
);

await sleep(800);

log(
'✅ Gemas/poeira empilhadas.'
);

empilhou = true;

} else {
log(
'💎 Nada pronto para empilhar.'
);
}

const fechar =
document.querySelector(
'[aria-label="Close"],[aria-label="Fechar"]'
) ||
clicaveisVisiveis().find(
(el) => {
const t =
normalizedText(el);

return (
t === '×' ||
t === 'X' ||
soLetras(t) === 'fechar'
);
}
);

if (fechar) {
simulateClick(
fechar
);

await sleep(250);
}

return empilhou;

} catch (err) {
console.error(
'[TowerFarm][Gemas] Erro:',
err
);

log(
'⚠️ Erro ao verificar gemas.'
);

return false;
}
}

// ============================================================
// AÇÕES
// ============================================================

function simulateClick(el) {
if (!el) return false;

const r =
el.getBoundingClientRect();

const opts = {
bubbles: true,
cancelable: true,
view: window,
clientX:
r.left + r.width / 2,
clientY:
r.top + r.height / 2
};

try {
el.dispatchEvent(
new PointerEvent(
'pointerdown',
opts
)
);
} catch {}

el.dispatchEvent(
new MouseEvent(
'mousedown',
opts
)
);

try {
el.dispatchEvent(
new PointerEvent(
'pointerup',
opts
)
);
} catch {}

el.dispatchEvent(
new MouseEvent(
'mouseup',
opts
)
);

el.dispatchEvent(
new MouseEvent(
'click',
opts
)
);

return true;
}

function sleep(ms) {
return new Promise(
(resolve) =>
setTimeout(resolve, ms)
);
}

function waitFor(
predicate,
timeoutMs
) {
return new Promise(
(resolve) => {
if (predicate()) {
resolve(true);
return;
}

const start =
performance.now();

let done = false;

const finish =
(result) => {
if (done) return;

done = true;

obs.disconnect();

clearInterval(
fallback
);

resolve(result);
};

const check = () => {
try {
if (predicate()) {
finish(true);
return;
}
} catch {}

if (
performance.now() -
start >=
timeoutMs
) {
finish(false);
}
};

const obs =
new MutationObserver(
check
);

obs.observe(
document.body,
{
childList: true,
subtree: true,
characterData: true
}
);

const fallback =
setInterval(
check,
100
);
}
);
}

// ============================================================
// BOSS
// ============================================================

const BOSS_FALHA_COOLDOWN_MS =
10 * 60 * 1000;

const BOSS_COOLDOWN_BASE_HORAS = 3;
const BOSS_COOLDOWN_PASSO_HORAS = 1;
const BOSS_ANDAR_PASSO = 10;

function loadBossState() {
const defaults = {
bossFailedAt: 0,
pendingInventoryCleanup: false,
highestBossFloor: null,
bossCooldowns: {}
};

try {
const raw =
localStorage.getItem(
BOSS_STATE_KEY
);

return raw
? Object.assign(
defaults,
JSON.parse(raw)
)
: defaults;

} catch {
return defaults;
}
}

function saveBossState() {
try {
localStorage.setItem(
BOSS_STATE_KEY,
JSON.stringify(
bossState
)
);
} catch {}
}

const bossState =
loadBossState();

function cooldownHorasParaAndar(
andar,
maiorAndar
) {
const degraus =
(maiorAndar - andar) /
BOSS_ANDAR_PASSO;

return (
BOSS_COOLDOWN_BASE_HORAS +
degraus *
BOSS_COOLDOWN_PASSO_HORAS
);
}

function parseBlocoDuracao(
bloco
) {
if (
!bloco ||
!bloco.trim()
) {
return null;
}

const h =
bloco.match(
/(\d+)\s*h/i
);

const min =
bloco.match(
/(\d+)\s*m\b/i
);

const s =
bloco.match(
/(\d+)\s*s/i
);

if (!h && !min && !s) {
return null;
}

const horas =
h
? parseInt(h[1], 10)
: 0;

const minutos =
min
? parseInt(min[1], 10)
: 0;

const segundos =
s
? parseInt(s[1], 10)
: 0;

return (
horas * 3600000 +
minutos * 60000 +
segundos * 1000
);
}

function parseRenascimentoMs(
texto
) {
const m =
texto.match(
/Renascimento em\s*((?:\d+\s*h\s*)?(?:\d+\s*m\s*)?(?:\d+\s*s\s*)?)/i
);

if (!m) return null;

return parseBlocoDuracao(
m[1]
);
}

function estaEmDescansoObrigatorio() {
return document.body.innerText.includes(
'Descanso obrigatório'
);
}

function parseDescansoMs(
texto
) {
const m =
texto.match(
/aguarde\s*((?:\d+\s*h\s*)?(?:\d+\s*m\s*)?(?:\d+\s*s\s*)?)\s*antes/i
);

if (!m) return null;

return parseBlocoDuracao(
m[1]
);
}

function findRepararEquipamentosButton() {
return findClickableByText(
'Reparar equipamentos'
);
}

function formatMs(ms) {
const totalMin =
Math.max(
0,
Math.round(
ms / 60000
)
);

const h =
Math.floor(
totalMin / 60
);

const m =
totalMin % 60;

return h > 0
? `${h}h${m}m`
: `${m}m`;
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

function findChefoesTabButton() {
return findExactClickableByText(
'Chefões'
);
}

function findExpedicaoTabButton() {
return findExactClickableByText(
'Expedição'
);
}

function findSantuarioButton() {
return findClickableByText(
'Santuário'
);
}

function findTorreInfinitaNavButton() {
return findClickableByText(
'Torre Infinita'
);
}

function findChallengeButton() {
return findClickableByText(
'Desafiar o Chefão'
);
}

function findContinueResultButton() {
return findExactClickableByText(
'Continuar'
);
}

function findSalonButtonForFloor(
floor
) {
for (
const el of clicaveisVisiveis()
) {
const spans =
el.querySelectorAll(
'span'
);

let temChefao =
false;

let temAndar =
false;

for (
const sp of spans
) {
const texto =
normalizedText(sp);

if (
soLetras(texto) ===
'chefao' ||
texto === '💀'
) {
temChefao = true;
}

if (
texto ===
String(floor)
) {
temAndar = true;
}
}

if (
temChefao &&
temAndar
) {
return el;
}
}

return null;
}

function findExpeditionFloorButton(
floor
) {
return (
lerAndaresDeExpedicaoNaTela()
.find(
(item) =>
item.andar ===
floor &&
!item.bloqueado
)?.el ||
null
);
}

function lerAndaresDeChefaoNaTela() {
const andares = [];

for (
const el of clicaveisVisiveis()
) {
const spans =
[
...el.querySelectorAll(
'span'
)
];

const temChefao =
spans.some(
(sp) => {
const texto =
normalizedText(
sp
);

return (
soLetras(
texto
) ===
'chefao' ||
texto === '💀'
);
}
);

if (!temChefao) {
continue;
}

for (
const sp of spans
) {
const t =
normalizedText(sp);

if (
/^\d+$/.test(t)
) {
andares.push(
parseInt(
t,
10
)
);
}
}
}

return [
...new Set(andares)
].sort(
(a, b) => b - a
);
}

function proximoChefaoPronto(
now
) {
const andares =
Object.keys(
bossState.bossCooldowns
).map(Number);

if (!andares.length) {
return 'seed';
}

const prontos =
andares.filter(
(a) =>
bossState
.bossCooldowns[a] <=
now
);

if (!prontos.length) {
return null;
}

return Math.max(
...prontos
);
}

async function voltarPraExpedicao() {
try {
const torreBtn =
findTorreInfinitaNavButton();

if (torreBtn) {
simulateClick(
torreBtn
);
}

await waitFor(
() =>
!!findExpedicaoTabButton() ||
!!findStartButton(),
2000
);

const expTab =
findExpedicaoTabButton();

if (expTab) {
simulateClick(
expTab
);
}

await waitFor(
() =>
lerAndaresDeExpedicaoNaTela()
.length > 0,
2500
);

const desejado =
state.expeditionFloorBeforeBoss;

let floorBtn =
Number.isFinite(
desejado
)
? findExpeditionFloorButton(
desejado
)
: null;

if (!floorBtn) {
floorBtn =
maiorAndarDesbloqueadoNaTela()
?.el ||
null;
}

if (
floorBtn &&
!findStartButton()
) {
simulateClick(
floorBtn
);
}

await waitFor(
() =>
!!findStartButton(),
3500
);

} catch (err) {
console.error(
'[TowerFarm] Erro voltando:',
err
);
}
}

async function fecharResultadoDoChefao() {
try {
const btn =
findContinueResultButton() ||
findClickableByText('OK') ||
findClickableByText('Fechar') ||
findClickableByText('Voltar');

if (btn) {
simulateClick(btn);
}

await waitFor(
() =>
!findContinueResultButton(),
1500
);

} catch {}
}

async function tentarUmChefao(
alvo
) {
const salaoBtn =
findSalonButtonForFloor(
alvo
);

if (salaoBtn) {
simulateClick(
salaoBtn
);
}

await waitFor(
() =>
!!findChallengeButton() ||
document.body.innerText.includes(
'Renascimento em'
),
2000
);

const textoAtual =
document.body.innerText;

const renascAgora =
parseRenascimentoMs(
textoAtual
);

if (
renascAgora !== null
) {
bossState.bossCooldowns[
alvo
] =
Date.now() +
renascAgora;

saveBossState();

log(
`Chefão ${alvo} ainda em cooldown (${formatMs(renascAgora)}).`
);

return 'indisponivel';
}

const desafiarBtn =
findChallengeButton();

if (
!desafiarBtn ||
desafiarBtn.disabled
) {
bossState.bossCooldowns[
alvo
] =
Date.now() +
10 * 60 * 1000;

saveBossState();

return 'indisponivel';
}

simulateClick(
desafiarBtn
);

log(
`Desafiando o Chefão ${alvo}...`
);

await waitFor(
() =>
!findChallengeButton(),
4000
);

const RESULT_REGEX =
/vitória!|derrota!|você (foi )?derrotad|perdeu (o|a) (duelo|combate|batalha)/i;

await waitFor(
() =>
RESULT_REGEX.test(
document.body.innerText
),
25000
);

const texto =
document.body.innerText;

const venceu =
/vitória!/i.test(
texto
);

const derrotaConfirmada =
/derrota!|você (foi )?derrotad|perdeu (o|a) (duelo|combate|batalha)/i
.test(texto);

if (venceu) {
const renascMs =
parseRenascimentoMs(
texto
);

const cooldownMs =
renascMs !== null
? renascMs
: cooldownHorasParaAndar(
alvo,
bossState.highestBossFloor ||
alvo
) *
3600000;

bossState.bossCooldowns[
alvo
] =
Date.now() +
cooldownMs;

bossState.pendingInventoryCleanup =
true;

saveBossState();

log(
`👹 Chefão ${alvo}: vitória! Próxima tentativa em ${formatMs(cooldownMs)}.`
);

await fecharResultadoDoChefao();

return 'vitoria';
}

if (!derrotaConfirmada) {
bossState.bossCooldowns[
alvo
] =
Date.now() +
2 * 60 * 1000;

saveBossState();

await fecharResultadoDoChefao();

return 'indeterminado';
}

bossState.bossFailedAt =
Date.now();

saveBossState();

log(
`💀 Chefão ${alvo}: derrota - trava de 10 minutos.`
);

await fecharResultadoDoChefao();

return 'derrota';
}

async function cicloDeChefoes() {
log(
'👹 Indo aos Chefões...'
);

state.expeditionFloorBeforeBoss =
getAndarAtualNumero();

const tab =
findChefoesTabButton();

if (tab) {
simulateClick(tab);
}

await waitFor(
() =>
lerAndaresDeChefaoNaTela()
.length > 0,
3000
);

const andares =
lerAndaresDeChefaoNaTela();

if (andares.length) {
bossState.highestBossFloor =
Math.max(
...andares,
bossState.highestBossFloor ||
0
);

const now =
Date.now();

andares.forEach(
(a) => {
if (
!(a in
bossState.bossCooldowns)
) {
bossState
.bossCooldowns[a] =
now;
}
}
);

saveBossState();
}

while (true) {
let proximo =
proximoChefaoPronto(
Date.now()
);

if (
proximo ===
'seed'
) {
proximo =
andares.length
? Math.max(
...andares
)
: null;
}

if (
proximo ===
null
) {
break;
}

const resultado =
await tentarUmChefao(
proximo
);

if (
resultado ===
'derrota'
) {
break;
}
}

await voltarPraExpedicao();
}

// ============================================================
// REPARO
// ============================================================

async function repararEquipamentoENotificar() {
try {
log(
'🔧 Expedição derrotada - reparando equipamento...'
);

const santuarioBtn =
findSantuarioButton();

if (santuarioBtn) {
simulateClick(
santuarioBtn
);
}

await waitFor(
() =>
!!findRepararEquipamentosButton(),
2500
);

const repararBtn =
findRepararEquipamentosButton();

if (
repararBtn &&
!repararBtn.disabled
) {
simulateClick(
repararBtn
);

log(
'🔧 Equipamento reparado.'
);

await sleep(500);
}

} catch (err) {
console.error(
'[TowerFarm] Erro reparando:',
err
);

} finally {
state.repairedThisRest =
true;

await voltarPraExpedicao();
}
}

// ============================================================
// INVENTÁRIO
// ============================================================


const CODEX_FAMILIES = {
'Comum': [
'jade'
],
'Raro': [
'guardiao'
],
'Épico': [
'vazio',
'tempestade',
'poison'
],
'Lendário': [
'zeus',
'vampire',
'poseidon',
'ossos',
'nuvens',
'hades',
'fire dragon',
'escama de dragao',
'dynasty',
'doces',
'cosmos',
'ares',
'anjo',
'afrodite'
]
};

function isCodexItemText(
texto,
raridade
) {
if (
!config.protectCodex
) {
return false;
}

const familias =
CODEX_FAMILIES[
raridade
] || [];

if (!familias.length) {
return false;
}

const normalizado =
soLetras(
texto
);

return familias.some(
(nome) =>
normalizado.includes(
soLetras(nome)
)
);
}


function findInventoryModalRoot() {
const selecionarTodos =
clicaveisVisiveis().find(
(el) =>
soLetras(
normalizedText(el)
) ===
'selecionar todos'
) || null;

if (!selecionarTodos) {
return document.body;
}

return (
selecionarTodos.closest(
'[role="dialog"], .modal, [class*="modal"], [class*="dialog"]'
) ||
selecionarTodos.parentElement?.parentElement?.parentElement ||
document.body
);
}

function elementoMaisProfundoComTexto(
root,
needle
) {
const normalNeedle =
soLetras(
needle
);

return [
...root.querySelectorAll(
'div, span, p, strong, b, small, label, button, li'
)
].filter(
(el) => {
if (
el.offsetParent === null
) {
return false;
}

const txt =
soLetras(
normalizedText(el)
);

if (
!txt ||
!txt.includes(
normalNeedle
)
) {
return false;
}

return ![
...el.children
].some(
(child) =>
soLetras(
normalizedText(child)
).includes(
normalNeedle
)
);
}
);
}

function findItemCardFromElement(
el,
modalRoot
) {
let atual = el;
let melhor = null;

for (
let i = 0;
i < 9 &&
atual &&
atual !== modalRoot;
i += 1
) {
const texto =
normalizedText(
atual
);

const classe =
String(
atual.className || ''
).toLowerCase();

const interativo =
atual.matches?.(
'button,[role="button"],label,[data-item-id],[data-id]'
);

const pareceCard =
/item|card|slot|inventory|equip|grid-item|selectable/.test(
classe
);

const temImagem =
!!atual.querySelector?.(
'img,svg'
);

if (
texto &&
texto.length < 420 &&
(
interativo ||
pareceCard ||
temImagem
)
) {
melhor = atual;

if (
interativo ||
pareceCard
) {
break;
}
}

atual =
atual.parentElement;
}

return melhor;
}

async function desmarcarItensCodex(
raridade
) {
if (
!config.protectCodex
) {
return 0;
}

const familias =
CODEX_FAMILIES[
raridade
] || [];

if (!familias.length) {
return 0;
}

const modalRoot =
findInventoryModalRoot();

const cards =
[];

for (
const familia of familias
) {
const textos =
elementoMaisProfundoComTexto(
modalRoot,
familia
);

for (
const el of textos
) {
const card =
findItemCardFromElement(
el,
modalRoot
);

if (
card &&
!cards.includes(
card
)
) {
cards.push(
card
);
}
}
}

let protegidos = 0;

for (
const card of cards
) {
const texto =
normalizedText(
card
);

if (
!isCodexItemText(
texto,
raridade
)
) {
continue;
}

const checkbox =
card.matches?.(
'input[type="checkbox"]'
)
? card
: card.querySelector?.(
'input[type="checkbox"]'
);

if (
checkbox &&
checkbox.checked &&
!checkbox.disabled
) {
simulateClick(
checkbox
);

protegidos += 1;
await sleep(100);
continue;
}

/*
Após "Selecionar todos", todos os cards estão selecionados.
Em algumas versões do jogo o item não possui checkbox; o próprio
card é clicável. Clicar uma vez nele remove somente aquele item.
*/
const clicavel =
card.matches?.(
'button,[role="button"],label'
)
? card
: card.querySelector?.(
'button,[role="button"],label'
) || card;

if (
clicavel &&
clicavel.offsetParent !== null
) {
simulateClick(
clicavel
);

protegidos += 1;
await sleep(120);
}
}

if (protegidos) {
log(
`📚 Codex: ${protegidos} item(ns) protegido(s) em ${raridade}.`
);
} else {
log(
`📚 Codex: nenhum item protegido detectado em ${raridade}.`
);
}

return protegidos;
}

async function runInventoryCleanup() {
if (state.maintenanceRunning) {
return false;
}

state.maintenanceRunning = true;

const acao =
config.inventoryAction === 'desmontar'
? 'Desmontar'
: 'Vender';

const raridades =
Array.isArray(config.sellRarities)
? config.sellRarities.filter(Boolean)
: [];

let totalProcessado = 0;

try {
if (!raridades.length) {
return false;
}

let abrirBtn =
findClickableByText(
'Desmontar/Vender'
);

if (!abrirBtn) {
const santuarioBtn =
findSantuarioButton();

if (santuarioBtn) {
simulateClick(
santuarioBtn
);

await sleep(450);

await waitFor(
() =>
!!findClickableByText(
'Desmontar/Vender'
),
2200
);

abrirBtn =
findClickableByText(
'Desmontar/Vender'
);
}
}

if (!abrirBtn) {
log(
'⚠️ Desmontar/Vender não encontrado.'
);

return false;
}

log(
`🧹 Inventário: ${acao} [${raridades.join(', ')}]...`
);

if (
config.protectCodex
) {
log(
'📚 Codex ATIVO: itens do Codex serão preservados.'
);
}

simulateClick(
abrirBtn
);

await sleep(500);

const acharAba =
() =>
clicaveisVisiveis().find(
(el) =>
soLetras(
normalizedText(el)
) ===
soLetras(acao)
) || null;

await waitFor(
() => !!acharAba(),
1800
);

const aba =
acharAba();

if (!aba) {
log(
`⚠️ Aba ${acao} não encontrada.`
);

return false;
}

simulateClick(
aba
);

await sleep(350);

for (
const raridade of raridades
) {
const raridadeBtn =
clicaveisVisiveis().find(
(el) =>
soLetras(
normalizedText(el)
) ===
soLetras(raridade)
) || null;

if (!raridadeBtn) {
log(
`ℹ️ Filtro ${raridade} não encontrado.`
);

continue;
}

simulateClick(
raridadeBtn
);

await sleep(350);

const selecionarTodos =
clicaveisVisiveis().find(
(el) =>
soLetras(
normalizedText(el)
) ===
'selecionar todos'
) || null;

if (
selecionarTodos &&
!selecionarTodos.disabled
) {
simulateClick(
selecionarTodos
);

await sleep(350);

if (
config.protectCodex
) {
await desmarcarItensCodex(
raridade
);

await sleep(250);
}
}

const confirmar =
clicaveisVisiveis().find(
(el) => {
const original =
normalizedText(el);

const texto =
soLetras(original);

const inicio =
soLetras(acao);

return (
texto !== inicio &&
texto.startsWith(inicio) &&
texto.includes('item') &&
/\d+/.test(original)
);
}
) || null;

if (!confirmar) {
log(
`ℹ️ Nenhum item ${raridade} para ${acao.toLowerCase()}.`
);

continue;
}

const m =
normalizedText(confirmar)
.match(
/(\d+)\s*item/i
);

const quantidade =
m
? parseInt(m[1], 10)
: 0;

if (
!quantidade ||
confirmar.disabled ||
confirmar.getAttribute(
'aria-disabled'
) === 'true'
) {
log(
`ℹ️ Nenhum item ${raridade} para ${acao.toLowerCase()}.`
);

continue;
}

log(
`🧹 ${acao} ${quantidade} item(ns) ${raridade}...`
);

simulateClick(
confirmar
);

await sleep(800);

totalProcessado +=
quantidade;
}

const fechar =
document.querySelector(
'[aria-label="Close"],[aria-label="Fechar"]'
) ||
clicaveisVisiveis().find(
(el) => {
const t =
normalizedText(el);

return (
t === '×' ||
t === 'X' ||
soLetras(t) === 'fechar'
);
}
);

if (fechar) {
simulateClick(
fechar
);

await sleep(250);
}

if (
totalProcessado > 0
) {
log(
`✅ Inventário: ${totalProcessado} item(ns) processado(s).`
);
}

return (
totalProcessado > 0
);

} catch (err) {
console.error(
'[TowerFarm][Inventário]',
err
);

log(
'⚠️ Erro durante limpeza do inventário.'
);

return false;

} finally {
state.maintenanceRunning =
false;

bossState.pendingInventoryCleanup =
false;

saveBossState();
}
}

async function executarManutencao() {
await runInventoryCleanup();
await empilharGemas();
await voltarPraExpedicao();
await sleep(400);
}

// ============================================================
// TELA DE PREPARAÇÃO
// ============================================================

async function handleIdleScreen(startBtn) {
const now = Date.now();

await coletarLootNoChao();

if (
state.needsMaintenance ||
state.wasInExpedition ||
bossState.pendingInventoryCleanup
) {
state.needsMaintenance = false;
state.wasInExpedition = false;

await executarManutencao();

startBtn =
findStartButton() ||
startBtn;
}

if (
estaEmDescansoObrigatorio()
) {
const restante =
parseDescansoMs(
document.body.innerText
);

const saiuVoluntariamente =
state.voluntaryExitAt > 0 &&
now -
state.voluntaryExitAt <
15000;

if (
saiuVoluntariamente
) {
logEsperaThrottled(
`Descanso após saída voluntária${restante !== null ? ` (~${formatMs(restante)})` : ''}...`
);

return;
}

if (
!state.repairedThisRest
) {
await repararEquipamentoENotificar();

return;
}

logEsperaThrottled(
`Descansando${restante !== null ? ` (~${formatMs(restante)})` : ''}...`
);

return;
}

if (
state.repairedThisRest
) {
await sleep(800);

if (
estaEmDescansoObrigatorio()
) {
return;
}

state.repairedThisRest =
false;

log(
'✅ Descanso encerrado - retomando.'
);
}

if (
config.bossMode
) {
const emTrava =
now -
bossState.bossFailedAt <
BOSS_FALHA_COOLDOWN_MS;

if (emTrava) {
const restante =
BOSS_FALHA_COOLDOWN_MS -
(
now -
bossState.bossFailedAt
);

logEsperaThrottled(
`⏳ Trava de derrota: ~${formatMs(restante)}`
);

return;
}

const proximo =
proximoChefaoPronto(
now
);

if (
proximo !== null
) {
await cicloDeChefoes();

return;
}
}

if (
config.mode ===
'subirTorre'
) {
const atual =
getAndarAtualNumero();

let melhor =
maiorAndarDesbloqueadoNaTela();

let tentativas =
0;

while (
(
!melhor ||
(
atual !== null &&
melhor.andar <= atual
)
) &&
tentativas < 3
) {
const subir =
findSubirPaginaAndaresButton();

if (
subir &&
!subir.disabled
) {
simulateClick(
subir
);
}

await sleep(300);

melhor =
maiorAndarDesbloqueadoNaTela();

tentativas++;
}

if (
melhor &&
atual !== null &&
melhor.andar > atual
) {
log(
`⬆️ Selecionando andar ${melhor.andar}...`
);

simulateClick(
melhor.el
);

await waitFor(
() =>
getAndarAtualNumero() ===
melhor.andar,
3000
);
}
}

const durBtn =
findDurationButton();

if (durBtn) {
simulateClick(
durBtn
);

await waitFor(
() => {
const atual =
getChanceConcluirDuracaoTexto();

return (
!!atual &&
atual.toLowerCase() ===
config.duration.toLowerCase()
);
},
2000
);
}

const iniciar =
findStartButton() ||
startBtn;

if (
!iniciar ||
!iniciar.isConnected
) {
return;
}

simulateClick(
iniciar
);

log(
`🚀 Iniciando expedição (${config.duration})...`
);

const iniciou =
await waitFor(
() => !findStartButton(),
7000
);

if (iniciou) {
state.wasInExpedition =
true;

} else {
log(
'⚠️ Servidor não confirmou início - tentando novamente.'
);
}
}

// ============================================================
// SAÍDA DA EXPEDIÇÃO
// ============================================================

function shouldExitNow() {
switch (
config.mode
) {
case 'itemOrThreshold': {
if (
itemApareceuNoMarco()
) {
log(
'🎁 Item detectado - saindo.'
);

return true;
}

const pct =
getExpeditionPercent();

if (
pct !== null &&
pct >=
config.thresholdPercent
) {
log(
`📊 ${pct.toFixed(1)}% atingido - saindo.`
);

return true;
}

return false;
}

case 'subirTorre':
default:
return false;
}
}

function attemptExit(
exitBtn
) {
state.acting = true;
state.actingSince =
Date.now();

simulateClick(
exitBtn
);

log(
'🚪 Saindo da expedição...'
);

waitFor(
() =>
!!findStartButton() ||
!findExitButton(),
1500
)
.then(
(confirmado) => {
if (confirmado) {
state.voluntaryExitAt =
Date.now();

state.acting =
false;

log(
'✅ Saída confirmada.'
);

return;
}

const cont =
findContinueButton();

if (cont) {
simulateClick(
cont
);
}

return waitFor(
() =>
!!findExitButton(),
1000
);
}
)
.then(
(continuar) => {
if (
continuar ===
undefined
) {
return;
}

const retry =
findExitButton();

if (retry) {
simulateClick(
retry
);
}

return waitFor(
() =>
!!findStartButton(),
3000
);
}
)
.then(
(ok) => {
if (
ok ===
undefined
) {
return;
}

state.voluntaryExitAt =
ok
? Date.now()
: 0;

state.acting =
false;

log(
ok
? '✅ Saída confirmada.'
: '⚠️ Saída não confirmada - tentando novamente.'
);
}
)
.catch(
(err) => {
console.error(
'[TowerFarm] Erro na saída:',
err
);

state.acting =
false;
}
);
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================

function tick() {
if (!licenseActive) {
return;
}

if (
!state.running ||
state.acting
) {
return;
}

const startBtn =
findStartButton();

if (startBtn) {
state.acting =
true;

state.actingSince =
Date.now();

handleIdleScreen(
startBtn
)
.catch(
(err) => {
console.error(
'[TowerFarm] Erro:',
err
);
}
)
.finally(
() => {
state.acting =
false;
}
);

return;
}

state.wasInExpedition =
true;

const lootTimers =
getLootTimers();

if (
lootTimers.length > 0
) {
state.acting =
true;

state.actingSince =
Date.now();

log(
`💰 ${lootTimers.length} loot(s) no chão detectado(s) — coletando...`
);

coletarLootNoChao()
.catch(
(err) => {
console.error(
'[TowerFarm][Loot] Erro durante expedição:',
err
);
}
)
.finally(
() => {
state.acting =
false;

scheduleTick();
}
);

return;
}

const exitBtn =
findExitButton();

if (!exitBtn) {
const emSalaChefao =
[
...document.querySelectorAll(
'h1,h2,h3'
)
].some(
(el) =>
/sal[aã]o do chef[aã]o/i.test(
normalizedText(el)
)
);

if (emSalaChefao) {
state.acting =
true;

state.actingSince =
Date.now();

voltarPraExpedicao()
.finally(
() => {
state.acting =
false;
}
);
}

return;
}

if (
shouldExitNow()
) {
attemptExit(
exitBtn
);
}
}

let scheduled =
false;

function scheduleTick() {
if (scheduled) {
return;
}

scheduled = true;

setTimeout(
() => {
scheduled = false;
tick();
},
0
);
}

const mainObserver =
new MutationObserver(
scheduleTick
);

mainObserver.observe(
document.body,
{
childList: true,
subtree: true,
characterData: true
}
);

setInterval(
scheduleTick,
1000
);

setInterval(
() => {
if (
state.acting &&
state.actingSince &&
Date.now() -
state.actingSince >
45000
) {
console.warn(
'[TowerFarm] Acting preso - resetando.'
);

state.acting =
false;

log(
'⚠️ Trava detectada - resetado.'
);
}
},
5000
);

// ============================================================
// LOG
// ============================================================

let statusEl = null;
let forgeStatusEl = null;
let forgeItemSelectEl = null;
let ultimoLogDeEspera = '';

function log(msg) {
state.lastLog =
msg;

if (statusEl) {
statusEl.textContent =
msg;
}

console.log(
'[TowerFarm]',
msg
);
}

function logEsperaThrottled(
msg
) {
if (
msg !==
ultimoLogDeEspera
) {
ultimoLogDeEspera =
msg;

log(msg);
}
}


// ============================================================
// FORJA AUTOMÁTICA
// ============================================================

function forgeLog(msg) {
if (forgeStatusEl) {
forgeStatusEl.textContent = msg;
}
console.log('[TowerFarm][Forja]', msg);
}


function getRefineFromText(texto) {
const m =
String(texto || '').match(
/\+(\d{1,2})\b/
);

return m
? Number(m[1])
: 0;
}

function getLevelFromText(texto) {
const m =
String(texto || '').match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*(\d+)/i
);

return m
? Number(m[1])
: null;
}

function hasForgeLevelText(texto) {
return /(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
String(texto || '')
);
}

function findForgeNavButton() {
const exact =
findExactClickableByText(
'Forja Arcana'
);

if (exact) {
return exact;
}

const partial =
findClickableByText(
'Forja Arcana'
);

if (partial) {
return partial;
}

const all =
[
...document.querySelectorAll(
'a,button,[role="button"],[onclick]'
)
];

return (
all.find(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(el)
).includes(
'forja arcana'
)
) ||
all.find(
(el) => {
const href =
String(
el.getAttribute?.('href') || ''
).toLowerCase();

return (
href.includes('forja') ||
href.includes('forge')
);
}
) ||
null
);
}

function navigateToForgeArcana() {
const nav =
findForgeNavButton();

if (!nav) {
return false;
}

try {
nav.click();
return true;
} catch {}

return simulateClick(
nav
);
}

function findForgeBackButton() {
return (
findExactClickableByText(
'Voltar ao painel'
) ||
findClickableByText(
'Voltar ao painel'
)
);
}

function findForgeUpgradeTab() {
return (
findExactClickableByText(
'Aprimoramento'
) ||
findClickableByText(
'Aprimoramento'
)
);
}

function findForgeUpgradeButton() {
return (
findExactClickableByText(
'Aprimorar'
) ||
clicaveisVisiveis().find(
(el) =>
soLetras(
normalizedText(el)
) === 'aprimorar'
) ||
null
);
}


function findBackpackRoot() {
const headings =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,div,span'
)
].filter(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(el)
) === 'mochila'
);

for (
const heading of headings
) {
let root =
heading.parentElement;

for (
let i = 0;
i < 6 && root;
i += 1
) {
const txt =
normalizedText(
root
);

if (
soLetras(txt).includes(
'mochila'
) &&
root.querySelector(
'img'
)
) {
return root;
}

root =
root.parentElement;
}
}

return null;
}

function forgeAttrText(el) {
if (!el) {
return '';
}

const attrs = [
'title',
'aria-label',
'data-name',
'data-item-name',
'data-tooltip',
'data-tippy-content',
'data-original-title',
'alt'
];

const vals = [];

for (
const attr of attrs
) {
const v =
el.getAttribute?.(
attr
);

if (v) {
vals.push(v);
}
}

for (
const child of [
...el.querySelectorAll?.(
'[title],[aria-label],[data-name],[data-item-name],[data-tooltip],[data-tippy-content],[data-original-title],img[alt],img[title]'
) || []
]
) {
for (
const attr of attrs
) {
const v =
child.getAttribute?.(
attr
);

if (v) {
vals.push(v);
}
}
}

return vals.join(
' '
);
}

function forgeImageKey(el) {
const img =
el?.matches?.('img')
? el
: el?.querySelector?.('img');

if (!img) {
return '';
}

const src =
String(
img.currentSrc ||
img.src ||
img.getAttribute(
'src'
) ||
''
);

if (!src) {
return '';
}

try {
const url =
new URL(
src,
location.href
);

return decodeURIComponent(
url.pathname.split('/').pop() || ''
)
.toLowerCase();
} catch {
return src
.split('/')
.pop()
.split('?')[0]
.toLowerCase();
}
}

function cleanForgeItemName(
raw,
level
) {
return String(
raw || ''
)
.replace(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig,
' '
)
.replace(
/N[ií]vel\s*\d+/ig,
' '
)
.replace(
/\+\s*\d+/g,
' '
)
.replace(
/\b(?:Comum|Incomum|Raro|Épico|Epico|Lendário|Lendario)\b/ig,
' '
)
.replace(
/\b(?:Cajado|Espada|Arco|Adaga|Machado|Elmo|Armadura|Luvas|Calças|Calcas|Botas|Anel|Colar)\b$/i,
' '
)
.replace(
/\s+/g,
' '
)
.trim();
}

function labelFromImageKey(
key,
level
) {
let label =
String(
key || ''
)
.replace(
/\.[a-z0-9]{2,5}$/i,
''
)
.replace(
/[_-]+/g,
' '
)
.replace(
/\b(?:item|icon|icone|equip|equipment|sprite|asset)\b/ig,
' '
)
.replace(
/\s+/g,
' '
)
.trim();

if (
!label ||
/^[a-f0-9]{12,}$/i.test(
label.replace(/\s/g, '')
)
) {
return `Equipamento Lv.${level || '?'}`;
}

return label
.split(' ')
.map(
(p) =>
p
? p[0].toUpperCase() + p.slice(1)
: p
)
.join(' ');
}

function extractForgeItemData(
card
) {
const visible =
normalizedText(
card
);

const attrs =
forgeAttrText(
card
);

const combined =
`${visible} ${attrs}`.trim();

const level =
getLevelFromText(
combined
);

if (!level) {
return null;
}

const key =
forgeImageKey(
card
);

let name =
cleanForgeItemName(
combined,
level
);

/*
Na Mochila o nome pode não estar visível. Primeiro tentamos atributos
(title/alt/data-*); se ainda não existir, usamos o nome do arquivo do ícone.
*/
if (
!name ||
soLetras(name) ===
soLetras(`Lv ${level}`) ||
name.length < 2
) {
name =
labelFromImageKey(
key,
level
);
}

return {
el: card,
text: combined,
name,
level,
refine: getRefineFromText(combined),
key
};
}


const FORGE_EQUIP_TYPES = [
'cajado',
'capuz',
'tunica',
'bota',
'calca',
'luva',
'anel',
'colar',
'capa'
];

function isForgeEquipTypeText(texto) {
const t =
soLetras(
texto
);

return FORGE_EQUIP_TYPES.some(
(tipo) =>
t.includes(
tipo
)
);
}


function getVisibleForgeTooltipText() {
const nodes =
[
...document.querySelectorAll(
'[role="tooltip"], .tooltip, [class*="tooltip"], [class*="popover"], [class*="tippy"], [data-popper-placement]'
)
].filter(
(el) =>
el.offsetParent !== null
);

const texts =
nodes.map(
(el) =>
normalizedText(el)
).filter(
(Boolean)
);

return texts.sort(
(a,b) =>
b.length - a.length
)[0] || '';
}

function dispatchForgeHover(el) {
if (!el) {
return;
}

const rect =
el.getBoundingClientRect();

const opts = {
bubbles: true,
cancelable: true,
view: window,
clientX:
rect.left +
Math.min(
Math.max(
rect.width / 2,
2
),
16
),
clientY:
rect.top +
Math.min(
Math.max(
rect.height / 2,
2
),
16
)
};

for (
const type of [
'mouseover',
'mouseenter',
'mousemove'
]
) {
try {
el.dispatchEvent(
new MouseEvent(
type,
opts
)
);
} catch {}
}
}

function dispatchForgeUnhover(el) {
if (!el) {
return;
}

const opts = {
bubbles: true,
cancelable: true,
view: window,
clientX: 1,
clientY: 1
};

for (
const type of [
'mouseout',
'mouseleave'
]
) {
try {
el.dispatchEvent(
new MouseEvent(
type,
opts
)
);
} catch {}
}
}

function clearForgeHoverState(targets = []) {
for (
const el of targets
) {
dispatchForgeUnhover(
el
);
}

/*
Força o mouse sintético para uma área neutra.
Assim os balões fecham antes do próximo item.
*/
try {
document.body.dispatchEvent(
new MouseEvent(
'mousemove',
{
bubbles: true,
cancelable: true,
view: window,
clientX: 1,
clientY: 1
}
)
);
} catch {}
}

function findBackpackLevelCards() {
const root =
findBackpackRoot();

if (!root) {
return [];
}

const all =
[
...root.querySelectorAll(
'*'
)
].filter(
(el) =>
el.offsetParent !== null &&
hasForgeLevelText(
normalizedText(el)
)
);

const result = [];

for (
const el of all
) {
let card =
el;

for (
let i = 0;
i < 5 &&
card.parentElement &&
card.parentElement !== root;
i += 1
) {
const parent =
card.parentElement;

const txt =
normalizedText(
parent
);

const levels =
(
txt.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

if (
levels <= 1 &&
txt.length < 180
) {
card =
parent;
} else {
break;
}
}

if (
!result.includes(
card
)
) {
result.push(
card
);
}
}

return result;
}


function getReactPayloadsFromElement(el) {
const payloads = [];

if (!el) {
return payloads;
}

for (const key of Object.keys(el)) {
if (
key.startsWith('__reactProps$') ||
key.startsWith('__reactFiber$') ||
key.startsWith('__reactInternalInstance$')
) {
try {
payloads.push(el[key]);
} catch {}
}
}

return payloads;
}

function collectPrimitiveStrings(obj, maxDepth = 4) {
const out = [];
const seen = new WeakSet();

function walk(value, depth, path) {
if (
value == null ||
depth > maxDepth
) {
return;
}

const type = typeof value;

if (
type === 'string' ||
type === 'number' ||
type === 'boolean'
) {
out.push({
path,
value: String(value)
});
return;
}

if (
type !== 'object' &&
type !== 'function'
) {
return;
}

if (
typeof value === 'object'
) {
if (seen.has(value)) {
return;
}
seen.add(value);
}

let entries = [];

try {
entries = Object.entries(value);
} catch {
return;
}

for (const [key, child] of entries) {
if (
key === 'return' ||
key === 'child' ||
key === 'sibling' ||
key === 'stateNode' ||
key === '_owner'
) {
continue;
}

walk(
child,
depth + 1,
path ? `${path}.${key}` : key
);
}
}

walk(obj, 0, '');

return out;
}

function normalizeEquipTypeFromText(texto) {
const t =
soLetras(
String(texto || '')
);

for (const tipo of FORGE_EQUIP_TYPES) {
if (t.includes(tipo)) {
return tipo;
}
}

return '';
}

function extractInternalItemFromPayload(payload) {
const pairs =
collectPrimitiveStrings(
payload,
4
);

if (!pairs.length) {
return null;
}

const joined =
pairs.map(
(x) => `${x.path}:${x.value}`
).join(' | ');

const tipo =
normalizeEquipTypeFromText(
joined
);

if (!tipo) {
return null;
}

function pickByKeys(keys, validator = null) {
for (const pair of pairs) {
const p =
soLetras(
pair.path
);

if (
keys.some(
(k) => p.endsWith(k) || p.includes(`.${k}`)
)
) {
if (
!validator ||
validator(pair.value)
) {
return pair.value;
}
}
}

return '';
}

let name =
pickByKeys(
[
'name',
'nome',
'itemname',
'displayname',
'title'
],
(v) =>
normalizeEquipTypeFromText(v)
);

if (!name) {
const candidate =
pairs.find(
(pair) =>
normalizeEquipTypeFromText(
pair.value
)
);

if (candidate) {
name =
candidate.value;
}
}

let levelRaw =
pickByKeys(
[
'level',
'lvl',
'nivel',
'itemlevel'
],
(v) =>
/^\d{1,4}$/.test(
String(v)
)
);

let level =
levelRaw
? Number(levelRaw)
: null;

if (!level) {
const m =
joined.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*(\d+)/i
);

if (m) {
level =
Number(m[1]);
}
}

let refineRaw =
pickByKeys(
[
'refine',
'refino',
'enhancement',
'upgrade',
'plus'
],
(v) =>
/^\+?\d{1,2}$/.test(
String(v)
)
);

let refine =
refineRaw
? Number(
String(refineRaw).replace('+', '')
)
: 0;

if (!refine) {
const m =
joined.match(
/(?:refino|refine|enhancement|upgrade)[^0-9+]{0,10}\+?(\d{1,2})/i
) ||
joined.match(
/\+(\d{1,2})\b/
);

if (m) {
refine =
Number(m[1]);
}
}

const id =
pickByKeys(
[
'id',
'itemid',
'uuid',
'_id'
],
(v) =>
String(v).length >= 6
);

const rarity =
pickByKeys(
[
'rarity',
'raridade',
'quality'
]
);

return {
name: String(name || '').trim(),
type: tipo,
level:
Number.isFinite(level)
? level
: null,
refine:
Number.isFinite(refine)
? refine
: 0,
id: String(id || ''),
rarity: String(rarity || ''),
raw: joined
};
}

function getInternalBackpackItems() {
const root =
findBackpackRoot();

if (!root) {
return [];
}

const nodes =
[
root,
...root.querySelectorAll('*')
];

const found = [];

for (const el of nodes) {
const payloads =
getReactPayloadsFromElement(
el
);

if (!payloads.length) {
continue;
}

for (const payload of payloads) {
const item =
extractInternalItemFromPayload(
payload
);

if (
!item ||
!item.name ||
!item.type
) {
continue;
}

const key =
[
item.id,
soLetras(item.name),
item.level ?? '',
item.refine ?? ''
].join('|');

if (
found.some(
(x) => x._key === key
)
) {
continue;
}

found.push({
...item,
el,
_key: key
});
}
}

return found;
}



function getPseudoText(el) {
let out = '';

for (const pseudo of ['::before','::after']) {
try {
const content =
getComputedStyle(
el,
pseudo
).content;

if (
content &&
content !== 'none' &&
content !== 'normal' &&
content !== '""'
) {
out +=
' ' +
String(content)
.replace(/^["']|["']$/g,'');
}
} catch {}
}

return out.trim();
}

function getElementSearchText(el) {
const attrs = [
'title',
'aria-label',
'data-title',
'data-name',
'data-item',
'data-item-name',
'data-tooltip',
'data-tippy-content',
'alt'
];

const parts = [
normalizedText(el),
getPseudoText(el)
];

for (const attr of attrs) {
const value =
el.getAttribute?.(
attr
);

if (value) {
parts.push(value);
}
}

return parts.join(' ').replace(/\s+/g,' ').trim();
}

function readLevelFromElement(el) {
const nodes = [
el,
...el.querySelectorAll?.('*') || []
];

for (const node of nodes) {
const text =
getElementSearchText(
node
);

const m =
text.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*(\d+)/i
);

if (m) {
return Number(m[1]);
}
}

return null;
}

function hasVisualItemAsset(el) {
try {
const bg =
getComputedStyle(
el
).backgroundImage;

if (
bg &&
bg !== 'none'
) {
return true;
}
} catch {}

return !!el.querySelector?.(
'img,svg'
);
}

function getBackpackHeading() {
return [
...document.querySelectorAll(
'h1,h2,h3,h4,h5,h6,div,span,p'
)
].find(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(el)
) === 'mochila'
) || null;
}

function isSlotSized(el) {
const r =
el.getBoundingClientRect();

return (
r.width >= 32 &&
r.width <= 150 &&
r.height >= 32 &&
r.height <= 150
);
}

function slotScore(el) {
let score = 0;

if (
readLevelFromElement(el)
) {
score += 6;
}

if (
hasVisualItemAsset(el)
) {
score += 3;
}

const role =
el.getAttribute?.(
'role'
);

const tag =
el.tagName?.toLowerCase();

if (
tag === 'button' ||
role === 'button' ||
el.tabIndex >= 0
) {
score += 2;
}

try {
const cursor =
getComputedStyle(
el
).cursor;

if (
cursor === 'pointer'
) {
score += 1;
}
} catch {}

return score;
}

function findBackpackContainer() {
const heading =
getBackpackHeading();

if (!heading) {
return null;
}

let best =
heading.parentElement;

let bestScore =
-1;

let node =
heading.parentElement;

for (
let depth = 0;
depth < 7 && node;
depth += 1
) {
const descendants =
[
...node.querySelectorAll(
'div,button,[role="button"],li,a'
)
].filter(
(el) =>
el.offsetParent !== null &&
isSlotSized(el)
);

const scored =
descendants.filter(
(el) =>
slotScore(el) >= 3
);

const score =
scored.length;

if (
score > bestScore
) {
bestScore =
score;

best =
node;
}

node =
node.parentElement;
}

return best;
}

function overlapRatio(a,b) {
const ar =
a.getBoundingClientRect();

const br =
b.getBoundingClientRect();

const left =
Math.max(
ar.left,
br.left
);

const top =
Math.max(
ar.top,
br.top
);

const right =
Math.min(
ar.right,
br.right
);

const bottom =
Math.min(
ar.bottom,
br.bottom
);

if (
right <= left ||
bottom <= top
) {
return 0;
}

const inter =
(right-left) *
(bottom-top);

const minArea =
Math.min(
ar.width*ar.height,
br.width*br.height
);

return minArea
? inter/minArea
: 0;
}

function findBackpackSlots() {
const root =
findBackpackContainer();

if (!root) {
return [];
}

let candidates =
[
...root.querySelectorAll(
'div,button,[role="button"],li,a'
)
].filter(
(el) =>
el.offsetParent !== null &&
isSlotSized(el) &&
slotScore(el) >= 3
);

candidates.sort(
(a,b) => {
const sa =
slotScore(a);

const sb =
slotScore(b);

if (
sb !== sa
) {
return sb-sa;
}

const ar =
a.getBoundingClientRect();

const br =
b.getBoundingClientRect();

return (
ar.width*ar.height
) - (
br.width*br.height
);
}
);

const selected = [];

for (const el of candidates) {
if (
selected.some(
(existing) =>
existing === el ||
existing.contains(el) ||
el.contains(existing) ||
overlapRatio(
existing,
el
) > .85
)
) {
continue;
}

selected.push(el);
}

return selected;
}


function getCardBackgroundKey(el) {
let node = el;

for (
let depth = 0;
depth < 6 && node;
depth += 1
) {
try {
const style =
getComputedStyle(
node
);

const bg =
String(
style.backgroundImage || ''
);

if (
bg &&
bg !== 'none'
) {
return bg;
}
} catch {}

try {
const img =
node.matches?.('img')
? node
: node.querySelector?.('img');

if (img) {
const src =
String(
img.currentSrc ||
img.src ||
img.getAttribute?.('src') ||
''
);

if (src) {
return src;
}
}
} catch {}

try {
for (const attr of [
'data-item-id',
'data-id',
'data-item',
'data-name',
'aria-label',
'title'
]) {
const value =
node.getAttribute?.(attr);

if (value) {
return `${attr}:${value}`;
}
}
} catch {}

node =
node.parentElement;
}

return '';
}


function collectRootsForDeepScan() {
const roots = [document];
const seen = new Set();

function walk(root) {
if (!root || seen.has(root)) return;
seen.add(root);

let all = [];
try {
all = root.querySelectorAll('*');
} catch {}

for (const el of all) {
try {
if (el.shadowRoot) {
roots.push(el.shadowRoot);
walk(el.shadowRoot);
}
} catch {}
}
}

walk(document);
return roots;
}

function findAllLevelMatchesDeep() {
const results = [];
const seenNodes = new Set();

const roots = collectRootsForDeepScan();

for (const root of roots) {
let walker;

try {
walker = document.createTreeWalker(
root,
NodeFilter.SHOW_TEXT
);
} catch {
continue;
}

let node;

while ((node = walker.nextNode())) {
if (seenNodes.has(node)) continue;
seenNodes.add(node);

const raw = String(node.nodeValue || '').trim();

if (!raw) continue;

const m = raw.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*(\d+)/i
);

if (!m) continue;

const parent = node.parentElement;

if (
parent &&
parent.offsetParent !== null
) {
results.push({
element: parent,
level: Number(m[1]),
source: 'text',
raw
});
}
}
}

/*
Também procura em atributos, porque alguns frameworks
guardam o texto visual no próprio elemento.
*/
for (const root of roots) {
let els = [];

try {
els = root.querySelectorAll('*');
} catch {
continue;
}

for (const el of els) {
if (el.offsetParent === null) continue;

for (const attr of [
'title',
'aria-label',
'alt',
'data-title',
'data-name',
'data-item',
'data-item-name',
'data-tooltip',
'data-tippy-content'
]) {
let value = '';

try {
value = el.getAttribute(attr) || '';
} catch {}

if (!value) continue;

const m = String(value).match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*(\d+)/i
);

if (m) {
results.push({
element: el,
level: Number(m[1]),
source: attr,
raw: String(value)
});
}
}
}
}

return results;
}

function nearestLikelyItemCard(el) {
if (!el) return null;

let node = el;
let best = el;
let bestScore = -999;

for (let depth = 0; depth < 8 && node; depth += 1) {
let score = 0;

try {
const r = node.getBoundingClientRect();

if (
r.width >= 35 &&
r.width <= 180 &&
r.height >= 35 &&
r.height <= 180
) {
score += 5;
}

if (
r.width > 250 ||
r.height > 250
) {
score -= 4;
}
} catch {}

try {
const style = getComputedStyle(node);

if (
style.backgroundImage &&
style.backgroundImage !== 'none'
) {
score += 3;
}

if (style.cursor === 'pointer') {
score += 2;
}
} catch {}

try {
if (node.querySelector('img,svg')) {
score += 3;
}
} catch {}

try {
if (
node.tagName === 'BUTTON' ||
node.getAttribute('role') === 'button' ||
node.tabIndex >= 0
) {
score += 2;
}
} catch {}

if (score > bestScore) {
bestScore = score;
best = node;
}

node = node.parentElement;
}

return best;
}


function getBackpackRegionByHeading() {
const headings =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,h6,div,span,p'
)
].filter(
(el) => {
if (el.offsetParent === null) {
return false;
}

const txt =
soLetras(
normalizedText(el)
);

return (
txt === 'mochila' ||
txt.startsWith('mochila ')
);
}
);

if (!headings.length) {
return null;
}

/*
Preferir o menor elemento que representa somente o título "Mochila".
*/
headings.sort(
(a,b) => {
const ar = a.getBoundingClientRect();
const br = b.getBoundingClientRect();

return (
ar.width * ar.height
) - (
br.width * br.height
);
}
);

const heading =
headings[0];

const hr =
heading.getBoundingClientRect();

/*
A mochila do dashboard aparece como uma área à direita/abaixo
do título. Usamos uma região geométrica larga para não depender
das classes React/Tailwind do site.
*/
return {
heading,
left:
Math.max(
0,
hr.left - 40
),
right:
Math.min(
window.innerWidth,
hr.right + 620
),
top:
Math.max(
0,
hr.top - 20
),
bottom:
Math.min(
document.documentElement.scrollHeight,
hr.bottom + 430
)
};
}

function pointInsideBackpackRegion(
el,
region
) {
if (!el || !region) {
return false;
}

const r =
el.getBoundingClientRect();

const cx =
r.left + r.width / 2;

const cy =
r.top + r.height / 2;

return (
cx >= region.left &&
cx <= region.right &&
cy >= region.top &&
cy <= region.bottom
);
}

async function scanBackpackEquipItems() {
forgeLog(
'🔎 Procurando itens com Lv/Lvl/Nível dentro da Mochila...'
);

const allMatches =
findAllLevelMatchesDeep();

if (!allMatches.length) {
forgeLog(
'❌ Nenhum Lv/Lvl/Nível encontrado na página.'
);
return [];
}

const region =
getBackpackRegionByHeading();

if (!region) {
forgeLog(
`⚠️ Achei ${allMatches.length} nível(is), mas não localizei o título Mochila.`
);
return [];
}

const backpackMatches =
allMatches.filter(
(hit) =>
pointInsideBackpackRegion(
hit.element,
region
)
);

console.log(
'[Tower Farm] Região da Mochila:',
region
);

console.log(
'[Tower Farm] Níveis dentro da região da Mochila:',
backpackMatches
);

if (!backpackMatches.length) {
forgeLog(
`⚠️ Achei ${allMatches.length} nível(is) na página, mas nenhum dentro da área da Mochila.`
);
return [];
}

const items = [];
const seen = new Set();

for (
let i = 0;
i < backpackMatches.length;
i += 1
) {
const hit =
backpackMatches[i];

const card =
nearestLikelyItemCard(
hit.element
) || hit.element;

const rect =
card.getBoundingClientRect();

const key =
[
hit.level,
Math.round(rect.left),
Math.round(rect.top),
Math.round(rect.width),
Math.round(rect.height)
].join('|');

if (seen.has(key)) {
continue;
}

seen.add(key);

let visible = '';

try {
visible =
getElementSearchText(
card
);
} catch {}

let name =
String(
visible || ''
)
.replace(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig,
' '
)
.replace(
/\+\s*\d+/g,
' '
)
.replace(
/\s+/g,
' '
)
.trim();

if (
!name ||
name.length < 2 ||
name.length > 100
) {
name =
`Item da Mochila ${items.length + 1}`;
}

const imageKey =
forgeImageKey(
card
) ||
getCardBackgroundKey(
card
) ||
'';

items.push({
el: card,
text:
visible ||
hit.raw,
name,
level:
hit.level,
refine:
getRefineFromText(
visible ||
hit.raw
),
key,
id: key,
imageKey,
type: '',
rarity: '',
source:
hit.source
});
}

forgeLog(
`✅ ${items.length} item(ns) com nível encontrado(s) dentro da Mochila.`
);

console.log(
'[Tower Farm] Itens da Mochila:',
items
);

return items;
}


function isForgeEquipmentItem(item) {
const combined =
soLetras(
[
item?.name || '',
item?.text || '',
item?.type || ''
].join(' ')
);

const equipTypes = [
'cajado',
'capuz',
'tunica',
'bota',
'botas',
'calca',
'calcas',
'luva',
'luvas',
'anel',
'colar',
'capa'
];

if (
equipTypes.some(
(type) =>
combined.includes(type)
)
) {
return true;
}

/*
Alguns equipamentos da Mochila não expõem o nome no DOM,
mas mostram o refino (+1, +2, ... +15) no próprio card.
Nesse caso mantemos o item para não perder cajados/equipamentos
cujo nome ainda não foi descoberto.
*/
const refine =
Number(
item?.refine || 0
);

if (
refine >= 1 &&
refine <= 15
) {
return true;
}

return false;
}


function backpackDisplayName(item, index) {
let name =
String(
item?.name ||
''
).trim();

const generic =
!name ||
/^item da mochila/i.test(
name
);

if (
generic &&
item?.imageKey
) {
const assetLabel =
labelFromImageKey(
item.imageKey,
item.level
);

if (
assetLabel &&
!/^equipamento lv/i.test(
assetLabel
)
) {
name =
assetLabel;
}
}

return (
name ||
`Item da Mochila ${index + 1}`
);
}

async function carregarItensDaMochila() {
if (!forgeItemSelectEl) {
forgeLog(
'❌ Seletor de equipamento da Forja não encontrado.'
);
return [];
}

forgeItemSelectEl.disabled =
true;

forgeItemSelectEl.innerHTML =
'<option value="">Carregando itens da Mochila...</option>';

let items = [];

try {
items =
await scanBackpackEquipItems();

items =
items.filter(
isForgeEquipmentItem
);

console.log(
'[Tower Farm] Equipamentos após filtro:',
items
);
} catch (err) {
console.error(
'[Tower Farm] Erro na varredura da Mochila:',
err
);

forgeItemSelectEl.innerHTML =
'<option value="">Erro ao carregar itens</option>';

forgeItemSelectEl.disabled =
false;

forgeLog(
`❌ Erro: ${err?.message || err}`
);

return [];
}

window.__towerForgeBackpackItems =
items;

forgeItemSelectEl.innerHTML = '';

if (!items.length) {
const opt =
document.createElement(
'option'
);

opt.value = '';
opt.textContent =
'Nenhum equipamento encontrado';

forgeItemSelectEl.appendChild(
opt
);

forgeItemSelectEl.disabled =
false;

return [];
}

/*
IMPORTANTE:
não chama fillForgeItemSelect().
Essa função não existe nesta versão.
Preenchemos o dropdown diretamente.
*/
items.forEach(
(item,index) => {
const opt =
document.createElement(
'option'
);

opt.value =
String(index);

opt.dataset.index =
String(index);

opt.dataset.key =
String(
item.key ||
item.id ||
''
);

opt.dataset.itemName =
String(
backpackDisplayName(
item,
index
)
);

opt.dataset.level =
String(
item.level ||
''
);

opt.dataset.refine =
String(
item.refine ||
0
);

opt.dataset.imageKey =
String(
item.imageKey ||
''
);

const level =
Number(
item.level || 0
);

const refine =
Number(
item.refine || 0
);

let label =
String(
backpackDisplayName(
item,
index
)
).trim();

if (
level &&
!/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
label
)
) {
label +=
` — Lv.${level}`;
}

if (refine > 0) {
label +=
` — +${refine}`;
}

opt.textContent =
label;

forgeItemSelectEl.appendChild(
opt
);
}
);

forgeItemSelectEl.disabled =
false;

forgeItemSelectEl.selectedIndex =
0;

const first =
items[0];

config.forgeItemKey =
String(
first.key ||
first.id ||
''
);

config.forgeItemName =
cleanSelectedBackpackName(
first.name ||
''
);

try {
saveConfig();
} catch {}

forgeLog(
`✅ ${items.length} equipamento(s) listado(s) no campo EQUIPAMENTO.`
);

return items;
}


/* Dropdown da Mochila - seleção persistente */
document.addEventListener(
'change',
(event) => {
const select =
event.target;

if (
!select ||
select.id !== 'tf-forge-item'
) {
return;
}

const index =
Number(
select.selectedOptions?.[0]?.dataset?.index
);

const items =
window.__towerForgeBackpackItems ||
[];

const item =
Number.isFinite(index)
? items[index]
: null;

if (!item) {
return;
}

config.forgeItemKey =
String(
item.key ||
item.id ||
''
);

config.forgeItemImageKey =
String(
item.imageKey ||
select.selectedOptions?.[0]?.dataset?.imageKey ||
''
);

config.forgeItemName =
cleanSelectedBackpackName(
item.name ||
select.selectedOptions?.[0]?.textContent ||
''
);

try {
saveConfig();
} catch {}
}
);

function findForgeInventoryRoot() {
const headings =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,div,span'
)
].filter(
(el) =>
el.offsetParent !== null &&
/invent[aá]rio\s*\(equip[aá]veis\)/i.test(
normalizedText(el)
)
);

for (
const heading of headings
) {
let root =
heading.parentElement;

for (
let i = 0;
i < 5 && root;
i += 1
) {
const txt =
normalizedText(root);

if (
/invent[aá]rio\s*\(equip[aá]veis\)/i.test(txt) &&
root.querySelectorAll(
'button,[role="button"],[tabindex],div'
).length > 1
) {
return root;
}

root =
root.parentElement;
}
}

return null;
}

function getForgeItemCards() {
const root =
findForgeInventoryRoot();

if (!root) {
return [];
}

const candidates =
[
...root.querySelectorAll(
'button,[role="button"],[tabindex],div,li'
)
].filter(
(el) =>
el.offsetParent !== null &&
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
normalizedText(el)
) &&
!!el.querySelector(
'img'
)
);

const items = [];

for (
const el of candidates
) {
let card = el;

for (
let i = 0;
i < 3 &&
card.parentElement &&
card.parentElement !== root;
i += 1
) {
const parent =
card.parentElement;

const levels =
(
normalizedText(
parent
).match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

if (
levels <= 1 &&
parent.querySelector(
'img'
)
) {
card = parent;
} else {
break;
}
}

const data =
extractForgeItemData(
card
);

if (!data) {
continue;
}

const duplicate =
items.some(
(item) =>
(
data.key &&
item.key === data.key
) ||
(
normalizeForgeItemName(
item.name
) ===
normalizeForgeItemName(
data.name
) &&
item.level === data.level
)
);

if (!duplicate) {
items.push(
data
);
}
}

return items;
}

function normalizeForgeItemName(name) {
return soLetras(
String(name || '')
.replace(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig,
' '
)
.replace(
/\b(?:Comum|Incomum|Raro|Épico|Epico|Lendário|Lendario)\b/ig,
' '
)
);
}


function cleanSelectedBackpackName(raw) {
let value =
String(
raw || ''
)
.trim();

/*
Remove informações extras que aparecem na opção da Mochila.
Mantemos somente o nome humano do equipamento.
*/
value =
value
.replace(
/\s*[—|-]\s*Lv\.?\s*\d+.*$/i,
''
)
.replace(
/\s*[—|-]\s*\+\d+.*$/i,
''
)
.replace(
/\s*\([^)]*\)\s*/g,
' '
)
.replace(
/\s*\|\|.*$/g,
''
)
.replace(
/\s+/g,
' '
)
.trim();

return value;
}

function getForgeCardName(card) {
if (!card) {
return '';
}

const text =
normalizedText(
card
);

const lines =
text
.split(/\n| {2,}/)
.map(
(x) =>
String(x || '').trim()
)
.filter(Boolean);

/*
Na Forja o nome fica visível no próprio card.
Ignora nível, tipo e raridade.
*/
for (const line of lines) {
if (
/^(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
line
)
) {
continue;
}

if (
/^(?:Cajado|Capuz|T[uú]nica|Bota|Botas|Cal[cç]a|Cal[cç]as|Luva|Luvas|Anel|Colar|Capa)$/i.test(
line
)
) {
continue;
}

if (
/^(?:Comum|Incomum|Raro|[ÉE]pico|Lend[aá]rio)$/i.test(
line
)
) {
continue;
}

if (
line.length >= 3
) {
return line;
}
}

return '';
}

function getForgeCardsByVisibleName() {
const root =
findForgeInventoryRoot();

if (!root) {
return [];
}

const raw =
[
...root.querySelectorAll(
'button,[role="button"],[tabindex],div,li'
)
].filter(
(el) =>
el.offsetParent !== null &&
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
normalizedText(el)
) &&
!!el.querySelector(
'img'
)
);

const result = [];

for (const el of raw) {
let card = el;

/*
Sobe somente enquanto o pai ainda contém UM único nível.
*/
for (
let i = 0;
i < 4 &&
card.parentElement &&
card.parentElement !== root;
i += 1
) {
const parent =
card.parentElement;

const count =
(
normalizedText(
parent
).match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

if (
count === 1 &&
parent.querySelector(
'img'
)
) {
card =
parent;
} else {
break;
}
}

if (
result.some(
(x) => x.el === card
)
) {
continue;
}

const text =
normalizedText(
card
);

const level =
getLevelFromText(
text
);

if (!level) {
continue;
}

const name =
getForgeCardName(
card
) ||
cleanForgeItemName(
text,
level
);

result.push({
el: card,
name,
level,
refine:
getRefineFromText(
text
),
text
});
}

return result;
}


function findExactVisibleTextElement(text) {
const wanted =
soLetras(
String(text || '')
);

if (!wanted) {
return null;
}

const candidates =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,h6,div,span,p,strong,b'
)
].filter(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(el)
) === wanted
);

if (!candidates.length) {
return null;
}

/*
O texto do nome costuma existir em mais de um ancestral.
Pegamos o menor elemento visível que contém exatamente o nome.
*/
candidates.sort(
(a,b) => {
const ar =
a.getBoundingClientRect();

const br =
b.getBoundingClientRect();

return (
ar.width * ar.height
) - (
br.width * br.height
);
}
);

return candidates[0];
}

function forgeCardFromNameElement(nameEl) {
if (!nameEl) {
return null;
}

let node =
nameEl;

let best =
null;

for (
let depth = 0;
depth < 8 && node;
depth += 1
) {
const text =
normalizedText(
node
);

const hasLevel =
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
text
);

const hasImg =
!!node.querySelector?.(
'img'
);

if (
hasLevel &&
hasImg
) {
best =
node;

const r =
node.getBoundingClientRect();

if (
r.width >= 180 &&
r.width <= 700 &&
r.height >= 55 &&
r.height <= 180
) {
return node;
}
}

node =
node.parentElement;
}

return best;
}

function findForgeItemDirectByName(name) {
const wantedName =
cleanSelectedBackpackName(
name
);

const nameEl =
findExactVisibleTextElement(
wantedName
);

if (!nameEl) {
return null;
}

const card =
forgeCardFromNameElement(
nameEl
);

if (!card) {
return null;
}

const text =
normalizedText(
card
);

return {
el: card,
name: wantedName,
level:
getLevelFromText(
text
) || 0,
refine:
getRefineFromText(
text
),
text
};
}

function readForgeCardRefineByName(name) {
const item =
findForgeItemDirectByName(
name
);

return item
? Number(
item.refine || 0
)
: null;
}


function forgeChosenBaseName(raw) {
let s =
String(
raw || ''
)
.replace(
/[\u00A0\t\r\n]+/g,
' '
)
.replace(
/\s+/g,
' '
)
.trim();

/*
Na Mochila o texto pode vir assim:
Anel de Cobre (comum) || [100/100] | Foco — Lv.98

Na Forja o nome visível é simplesmente:
Anel de Cobre

Então tudo após o PRIMEIRO:
(   |   —   [
é descartado.
*/
s =
s.split(
/[\(\|\—\[]/,
1
)[0]
.trim();

return s;
}

function scanForgeEquipCards() {
const root =
findForgeInventoryRoot();

if (!root) {
return [];
}

const all =
[
...root.querySelectorAll(
'div,button,[role="button"],li'
)
].filter(
(el) =>
el.offsetParent !== null
);

const candidates = [];

for (const el of all) {
const txt =
normalizedText(
el
);

if (
!/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/i.test(
txt
)
) {
continue;
}

if (
!el.querySelector(
'img'
)
) {
continue;
}

/*
Não aceita um container que engloba vários equipamentos.
O card individual possui exatamente um Lv.
*/
const levelCount =
(
txt.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

if (
levelCount !== 1
) {
continue;
}

const rect =
el.getBoundingClientRect();

if (
rect.width < 120 ||
rect.height < 45 ||
rect.height > 220
) {
continue;
}

candidates.push({
el,
text: txt,
area:
rect.width *
rect.height
});
}

/*
Para cada equipamento podem existir alguns ancestrais.
Preferimos o menor card visual.
*/
candidates.sort(
(a,b) =>
a.area -
b.area
);

const result = [];

for (const c of candidates) {
const duplicate =
result.some(
(r) =>
r.el.contains(
c.el
) ||
c.el.contains(
r.el
)
);

if (!duplicate) {
result.push(
c
);
}
}

return result;
}


function normalizeForgeAssetKey(value) {
return String(
value || ''
)
.split('?')[0]
.split('#')[0]
.toLowerCase()
.trim();
}

function findForgeCardByImageKey(imageKey) {
const wanted =
normalizeForgeAssetKey(
imageKey
);

if (!wanted) {
return null;
}

const root =
findForgeInventoryRoot();

if (!root) {
return null;
}

const imgs =
[
...root.querySelectorAll(
'img'
)
].filter(
(img) =>
img.offsetParent !== null
);

for (const img of imgs) {
const candidate =
normalizeForgeAssetKey(
forgeImageKey(
img
) ||
img.currentSrc ||
img.src ||
''
);

if (
!candidate ||
(
candidate !== wanted &&
!candidate.includes(
wanted
) &&
!wanted.includes(
candidate
)
)
) {
continue;
}

let node =
img;

for (
let depth = 0;
depth < 8 && node;
depth += 1
) {
const txt =
normalizedText(
node
);

const levels =
(
txt.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

const rect =
node.getBoundingClientRect();

if (
levels === 1 &&
rect.width >= 160 &&
rect.width <= 760 &&
rect.height >= 50 &&
rect.height <= 220
) {
const name =
getForgeCardName?.(
node
) ||
cleanForgeItemName(
txt,
getLevelFromText(
txt
)
);

return {
el: node,
nameEl: null,
name:
String(
name || ''
).trim(),
text: txt,
area:
rect.width *
rect.height,
imageKey:
candidate
};
}

node =
node.parentElement;
}
}

return null;
}

function findChosenCardInForge(chosenName) {
const baseName =
forgeChosenBaseName(
chosenName
);

const wanted =
soLetras(
baseName
);

const genericName =
!wanted ||
wanted.startsWith(
'item da mochila'
) ||
wanted.startsWith(
'equipamento lv'
);

/*
Para itens lendários cujo nome não aparece na Mochila:
usa a própria imagem do slot como identidade.
A mesma arte aparece no card correspondente da Forja.
*/
const imageKey =
String(
config.forgeItemImageKey ||
''
);

if (
imageKey
) {
const byImage =
findForgeCardByImageKey(
imageKey
);

if (byImage) {
if (
byImage.name &&
genericName
) {
config.forgeItemName =
forgeChosenBaseName(
byImage.name
);

saveConfig();
}

return byImage;
}
}

if (!wanted) {
return null;
}

/*
Fallback normal por nome.
*/
let exact =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,h6,div,span,p,strong,b'
)
].filter(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(
el
)
) === wanted
);

if (!exact.length) {
exact =
[
...document.querySelectorAll(
'div,span,p,strong,b'
)
].filter(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(
el
)
).includes(
wanted
)
);

exact.sort(
(a,b) => {
const ar =
a.getBoundingClientRect();

const br =
b.getBoundingClientRect();

return (
ar.width *
ar.height
) - (
br.width *
br.height
);
}
);
}

for (const nameEl of exact) {
let node =
nameEl;

for (
let depth = 0;
depth < 10 && node;
depth += 1
) {
const txt =
normalizedText(
node
);

const levels =
(
txt.match(
/(?:Lv(?:l)?\.?|N[ií]vel)\s*\d+/ig
) || []
).length;

const rect =
node.getBoundingClientRect();

if (
soLetras(
txt
).includes(
wanted
) &&
levels === 1 &&
rect.width >= 160 &&
rect.width <= 760 &&
rect.height >= 50 &&
rect.height <= 220
) {
return {
el: node,
nameEl,
name:
baseName,
text: txt,
area:
rect.width *
rect.height
};
}

node =
node.parentElement;
}
}

return null;
}

function rootSafeQueryAll(root, selector) {
try {
return root.querySelectorAll(
selector
);
} catch {
return [];
}
}

async function clickChosenForgeCard(chosenName) {
const baseName =
forgeChosenBaseName(
chosenName
);

forgeLog(
`🔎 Procurando somente "${baseName}" na Forja...`
);

const found =
findChosenCardInForge(
baseName
);

if (
found?.name &&
(
soLetras(
baseName
).startsWith(
'item da mochila'
) ||
soLetras(
baseName
).startsWith(
'equipamento lv'
)
)
) {
config.forgeItemName =
forgeChosenBaseName(
found.name
);

saveConfig();
}

if (!found?.el) {
forgeLog(
`⚠️ Não achei o card "${baseName}".`
);

return false;
}

forgeLog(
`🎯 Achei "${baseName}". Clicando no card...`
);

const emptyText =
'selecione um item no inventario para comecar';

const isEmpty =
() =>
soLetras(
document.body.innerText ||
''
).includes(
emptyText
);

try {
found.el.scrollIntoView({
block: 'center',
behavior: 'auto'
});
} catch {}

/*
1) Clica diretamente no texto do nome.
*/
if (found.nameEl) {
try {
found.nameEl.click();
} catch {}

simulateClick(
found.nameEl
);

let ok =
await waitFor(
() =>
!isEmpty(),
1000
);

if (ok) {
forgeLog(
`✅ "${baseName}" selecionado pelo nome.`
);

return true;
}
}

/*
2) Clica no card inteiro.
*/
try {
found.el.click();
} catch {}

simulateClick(
found.el
);

let ok =
await waitFor(
() =>
!isEmpty(),
1200
);

if (ok) {
forgeLog(
`✅ "${baseName}" selecionado pelo card.`
);

return true;
}

/*
3) Procura dentro do card algum elemento clicável.
*/
const clickable =
found.el.querySelector(
'button,[role="button"],a,[tabindex]'
);

if (clickable) {
try {
clickable.click();
} catch {}

simulateClick(
clickable
);

ok =
await waitFor(
() =>
!isEmpty(),
1200
);

if (ok) {
forgeLog(
`✅ "${baseName}" selecionado pelo elemento clicável.`
);

return true;
}
}

/*
4) Clique físico no centro do card.
*/
const r =
found.el.getBoundingClientRect();

const center =
document.elementFromPoint(
r.left + r.width / 2,
r.top + r.height / 2
);

if (center) {
try {
center.click();
} catch {}

simulateClick(
center
);

ok =
await waitFor(
() =>
!isEmpty(),
1200
);
}

if (ok) {
forgeLog(
`✅ "${baseName}" selecionado.`
);

return true;
}

forgeLog(
`⚠️ O card "${baseName}" foi encontrado, mas o clique não abriu o aprimoramento.`
);

return false;
}


async function abrirForjaAprimoramento() {
/*
Já estamos na Forja/Aprimoramento.
*/
if (
findForgeInventoryRoot()
) {
return true;
}

/*
Se a página da Forja já abriu mas a aba Aprimoramento ainda
precisa ser selecionada.
*/
let tab =
findForgeUpgradeTab();

if (tab) {
simulateClick(
tab
);

const abriuTab =
await waitFor(
() =>
!!findForgeInventoryRoot(),
3500
);

if (abriuTab) {
return true;
}
}

/*
Estamos no painel principal: entra pela navegação normal do jogo,
sem location.href, para evitar reload completo.
*/
const nav =
findForgeNavButton();

if (!nav) {
forgeLog(
'⚠️ Botão Forja Arcana não encontrado no painel.'
);

return false;
}

forgeLog(
'⚒️ Abrindo Forja Arcana...'
);

try {
nav.click();
} catch {
simulateClick(
nav
);
}

/*
Espera o React trocar para a tela da Forja.
*/
let abriu =
await waitFor(
() =>
!!findForgeInventoryRoot() ||
!!findForgeUpgradeTab(),
5000
);

if (!abriu) {
forgeLog(
'⚠️ A tela da Forja não abriu.'
);

return false;
}

/*
Se abriu a Forja mas ainda não está no Aprimoramento,
clica na aba.
*/
if (
!findForgeInventoryRoot()
) {
tab =
findForgeUpgradeTab();

if (tab) {
simulateClick(
tab
);
}

abriu =
await waitFor(
() =>
!!findForgeInventoryRoot(),
4000
);
}

return !!abriu;
}


function findForgeAnvilRoot() {
const headings =
[
...document.querySelectorAll(
'h1,h2,h3,h4,h5,h6,div,span'
)
].filter(
(el) =>
el.offsetParent !== null &&
soLetras(
normalizedText(el)
) === 'bigorna'
);

for (const heading of headings) {
let root =
heading.parentElement;

for (
let depth = 0;
depth < 7 && root;
depth += 1
) {
const txt =
normalizedText(
root
);

if (
/pr[oó]ximo n[ií]vel/i.test(
txt
) &&
/aprimorar/i.test(
txt
)
) {
return root;
}

root =
root.parentElement;
}
}

return null;
}

function getForgeCurrentRefineFromAnvil() {
const root =
findForgeAnvilRoot();

if (!root) {
return null;
}

const txt =
normalizedText(
root
);

/*
A tela mostra:
PRÓXIMO NÍVEL (+1)
=> item atual está +0

PRÓXIMO NÍVEL (+2)
=> item atual está +1
...
*/
const m =
txt.match(
/pr[oó]ximo\s+n[ií]vel\s*\(\+(\d{1,2})\)/i
);

if (m) {
return Math.max(
0,
Number(m[1]) - 1
);
}

/*
Fallback para telas que mostram "Refino +N".
*/
const r =
txt.match(
/(?:refino|aprimoramento)\s*\+?(\d{1,2})/i
);

return r
? Number(r[1])
: null;
}

function getForgeNextRefineFromAnvil() {
const root =
findForgeAnvilRoot();

if (!root) {
return null;
}

const txt =
normalizedText(
root
);

const m =
txt.match(
/pr[oó]ximo\s+n[ií]vel\s*\(\+(\d{1,2})\)/i
);

return m
? Number(m[1])
: null;
}

async function waitForgeAttemptProcessed(beforeCurrent) {
const expectedNextBefore =
Number(beforeCurrent) + 1;

const started =
performance.now();

while (
performance.now() - started < 1800
) {
await sleep(
120
);

const current =
getForgeCurrentRefineFromAnvil();

if (
current != null &&
current > beforeCurrent
) {
return {
processed: true,
success: true,
current
};
}

/*
Em falha, o "Próximo nível" não muda.
Então após uma janela curta consideramos tentativa processada.
Não esperamos o cooldown de 6s.
*/
const btn =
findForgeUpgradeButton();

const text =
normalizedText(
btn
);

if (
btn &&
(
btn.disabled ||
btn.getAttribute(
'aria-disabled'
) === 'true' ||
/aguarde|cooldown|\d+\s*s/i.test(
text
)
)
) {
return {
processed: true,
success: false,
current:
current == null
? beforeCurrent
: current
};
}
}

const finalCurrent =
getForgeCurrentRefineFromAnvil();

return {
processed: true,
success:
finalCurrent != null &&
finalCurrent > beforeCurrent,
current:
finalCurrent == null
? beforeCurrent
: finalCurrent
};
}


async function voltarDoForgeAoPainel() {
const voltar =
findForgeBackButton();

if (!voltar) {
forgeLog(
'⚠️ Botão "Voltar ao painel" não encontrado.'
);

return false;
}

forgeLog(
'↩️ Voltando ao painel...'
);

/*
Usa clique normal do próprio jogo para manter a navegação SPA.
*/
try {
voltar.click();
} catch {
simulateClick(
voltar
);
}

/*
Aguarda a Forja desaparecer e o painel principal voltar.
*/
const voltou =
await waitFor(
() =>
!findForgeInventoryRoot() &&
!!findForgeNavButton(),
5000
);

if (!voltou) {
forgeLog(
'⚠️ Cliquei em "Voltar ao painel", mas o painel principal não foi detectado.'
);

return false;
}

forgeLog(
'✅ Voltou ao painel. Reabrindo a Forja...'
);

return true;
}

async function executarUmUpgradeForja() {
const itemName =
forgeChosenBaseName(
config.forgeItemName ||
''
);

const target =
Number(
config.forgeTargetLevel
);

if (
!itemName ||
!Number.isFinite(target) ||
target < 1 ||
target > 15
) {
forgeLog(
'⚠️ Item/alvo inválido.'
);

return {
ok: false,
stop: true
};
}

/*
1) Entrar em Forja Arcana > Aprimoramento.
*/
const abriu =
await abrirForjaAprimoramento();

if (!abriu) {
forgeLog(
'⚠️ Não consegui abrir a Forja Arcana.'
);

return {
ok: false,
stop: true
};
}

await sleep(
250
);

/*
2) Varrer a lista da Forja e selecionar novamente o MESMO item.
*/
const selected =
await clickChosenForgeCard(
itemName
);

if (!selected) {
return {
ok: false,
stop: true
};
}

await sleep(
180
);

/*
3) Ler o refino atual pela Bigorna.
*/
let current =
getForgeCurrentRefineFromAnvil();

if (
current == null
) {
forgeLog(
'⚠️ Item selecionado, mas não consegui ler o refino atual na Bigorna.'
);

return {
ok: false,
stop: true
};
}

config.forgeItemRefine =
current;

saveConfig();

if (
current >= target
) {
forgeLog(
`✅ Forja concluída: ${itemName} +${current}. Voltando ao painel...`
);

config.forgeJobActive =
false;

saveConfig();

await voltarDoForgeAoPainel();

return {
ok: true,
stop: true,
refine: current
};
}

forgeLog(
`⚒️ ${itemName}: +${current} → +${target}. Aprimorando...`
);

/*
4) Clicar APRIMORAR uma única vez.
*/
const ready =
await waitFor(
() => {
const btn =
findForgeUpgradeButton();

return !!(
btn &&
!btn.disabled &&
btn.getAttribute(
'aria-disabled'
) !== 'true'
);
},
2500
);

if (!ready) {
forgeLog(
'⚠️ O botão APRIMORAR não ficou disponível.'
);

return {
ok: false,
stop: true
};
}

const aprimorar =
findForgeUpgradeButton();

try {
aprimorar.click();
} catch {
simulateClick(
aprimorar
);
}

/*
5) Esperar apenas o jogo processar sucesso/falha.
NÃO espera o cooldown de 6 segundos.
*/
const attempt =
await waitForgeAttemptProcessed(
current
);

current =
Number(
attempt.current
);

config.forgeItemRefine =
current;

saveConfig();

if (
attempt.success
) {
forgeLog(
`✅ Sucesso: ${itemName} agora está +${current}.`
);
} else {
forgeLog(
`❌ Falhou: ${itemName} continua +${current}.`
);
}

if (
current >= target
) {
forgeLog(
`✅ Forja concluída: ${itemName} +${current}. Voltando ao painel...`
);

config.forgeJobActive =
false;

saveConfig();

await voltarDoForgeAoPainel();

return {
ok: true,
stop: true,
refine: current
};
}

/*
6) Reset do cooldown:
Voltar ao painel ANTES dos 6s, depois o loop entra de novo.
*/
forgeLog(
'🔁 Upgrade processado. Voltando ao painel para resetar o cooldown...'
);

const voltou =
await voltarDoForgeAoPainel();

if (!voltou) {
forgeLog(
'⚠️ Não consegui voltar ao painel.'
);

return {
ok: false,
stop: true
};
}

await sleep(
260
);

return {
ok: true,
stop: false,
refine: current
};
}

async function forgeLoop() {
if (
state.forgeActing
) {
return;
}

state.forgeActing =
true;

try {
while (
state.forgeRunning &&
licenseActive
) {
const result =
await executarUmUpgradeForja();

if (
!state.forgeRunning
) {
break;
}

if (
result?.stop
) {
state.forgeRunning =
false;
break;
}

/*
Só uma pausa curta para a navegação do painel estabilizar.
*/
await sleep(
220
);
}
} catch (err) {
console.error(
'[TowerFarm][Forja] Erro:',
err
);

forgeLog(
`⚠️ Erro na automação da Forja: ${err?.message || err}`
);

state.forgeRunning =
false;
} finally {
state.forgeActing =
false;

if (
!state.forgeRunning
) {
config.forgeJobActive =
false;

saveConfig();
}

const btn =
document.getElementById(
'tf-forge-run'
);

if (btn) {
btn.textContent =
state.forgeRunning
? '■  PARAR FORJA'
: '▶  INICIAR FORJA';
}
}
}


// ============================================================
// PAINEL
// ============================================================

function buildPanel() {
const old = document.getElementById('tower-farm-panel');
if (old) old.remove();

const oldStyle = document.getElementById('tower-farm-panel-style');
if (oldStyle) oldStyle.remove();

const style = document.createElement('style');
style.id = 'tower-farm-panel-style';
style.textContent = `
#tower-farm-panel, #tower-farm-panel * { box-sizing: border-box; }
#tower-farm-panel {
  --tf-bg: rgba(10,14,24,.97);
  --tf-card: rgba(17,23,36,.88);
  --tf-card2: rgba(22,29,44,.92);
  --tf-border: rgba(148,163,184,.16);
  --tf-text: #f8fafc;
  --tf-muted: #9aa8bd;
  --tf-purple: #9b5cff;
  --tf-purple2: #6d28d9;
  --tf-green: #35e0a1;
  --tf-blue: #45a8ff;
  --tf-cyan: #2dd4bf;
  --tf-red: #ff6464;
  --tf-gold: #ffb84d;
  --tf-radius: 14px;
  scrollbar-color: rgba(148,163,184,.5) transparent;
  scrollbar-width: thin;
}
#tower-farm-panel ::-webkit-scrollbar { width: 7px; }
#tower-farm-panel ::-webkit-scrollbar-track { background: transparent; }
#tower-farm-panel ::-webkit-scrollbar-thumb { background: rgba(148,163,184,.42); border-radius: 999px; }
#tower-farm-panel select, #tower-farm-panel input[type="number"] {
  width: 100%; height: 34px; padding: 0 13px; color: var(--tf-text);
  background: rgba(15,20,32,.95); border: 1px solid rgba(148,163,184,.28);
  border-radius: 10px; outline: none; font: inherit; transition: .18s ease;
}
#tower-farm-panel select:hover, #tower-farm-panel input[type="number"]:hover { border-color: rgba(155,92,255,.65); }
#tower-farm-panel select:focus, #tower-farm-panel input[type="number"]:focus {
  border-color: var(--tf-purple); box-shadow: 0 0 0 3px rgba(155,92,255,.13);
}
#tower-farm-panel select option { background: #121827; color: #fff; }
.tf-card { display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 6px; padding: 6px 7px; margin: 3px 0;
  background: linear-gradient(145deg, rgba(20,27,42,.94), rgba(12,17,28,.94));
  border: 1px solid var(--tf-border); border-radius: var(--tf-radius); }
.tf-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 17px; border: 1px solid currentColor; background: rgba(255,255,255,.025); box-shadow: inset 0 0 22px rgba(255,255,255,.02); }
.tf-card-main { min-width: 0; }
.tf-card-head { display:flex; align-items:center; gap:8px; margin-bottom: 2px; }
.tf-card-title { font-size: 11px; font-weight: 800; letter-spacing: .45px; text-transform: uppercase; }
.tf-card-desc { color: var(--tf-muted); font-size: 11px; line-height: 1.35; margin-bottom: 2px; }
.tf-purple { color: #b56cff; } .tf-blue { color: var(--tf-blue); } .tf-cyan { color: var(--tf-cyan); }
.tf-red { color: var(--tf-red); } .tf-gold { color: var(--tf-gold); } .tf-green { color: #43e68f; }
.tf-toggle-row { display:flex; align-items:center; gap:10px; min-height: 38px; color: var(--tf-text); font-size: 11px; cursor:pointer; }
.tf-switch { position:relative; width:46px; height:25px; flex:0 0 auto; }
.tf-switch input { opacity:0; width:0; height:0; position:absolute; }
.tf-slider { position:absolute; inset:0; border-radius:999px; background:#273244; border:1px solid rgba(148,163,184,.22); transition:.2s ease; }
.tf-slider::after { content:""; position:absolute; width:19px; height:19px; left:2px; top:2px; border-radius:50%; background:#dbe4f0; transition:.2s ease; box-shadow:0 2px 7px rgba(0,0,0,.35); }
.tf-switch input:checked + .tf-slider { background: linear-gradient(90deg, var(--tf-purple2), var(--tf-purple)); border-color: rgba(196,132,252,.75); }
.tf-switch input:checked + .tf-slider::after { transform: translateX(21px); background:#fff; }
.tf-rarity-grid { display:grid; grid-template-columns: 1fr 1fr; gap:2px 6px; padding:4px 6px; margin-top:3px;
  border:1px solid rgba(148,163,184,.14); background:rgba(7,11,19,.36); border-radius:10px; }
.tf-check { display:flex; align-items:center; gap:7px; color:#e8edf5; font-size:12px; cursor:pointer; min-width:0; }
.tf-check input { appearance:none; width:16px; height:16px; margin:0; border:1px solid rgba(148,163,184,.48); border-radius:4px; background:#111827; display:grid; place-content:center; }
.tf-check input::before { content:"✓"; color:white; font-size:12px; line-height:1; transform:scale(0); transition:.12s ease; }
.tf-check input:checked { background:linear-gradient(135deg, var(--tf-purple), #7c3aed); border-color:#a855f7; box-shadow:0 0 10px rgba(168,85,247,.28); }
.tf-check input:checked::before { transform:scale(1); }
.tf-status { position:relative; min-height:32px; padding:4px 7px 4px 30px; border-radius:11px; color:#eaf0f7; font-size:12px; line-height:1.4;
  background:linear-gradient(90deg, rgba(20,83,67,.27), rgba(18,24,37,.88) 25%); border:1px solid rgba(53,224,161,.28); }
.tf-status::before { content:"✓"; position:absolute; left:7px; top:50%; transform:translateY(-50%); width:16px; height:16px; border-radius:50%; display:grid; place-content:center; background:rgba(53,224,161,.16); color:var(--tf-green); font-weight:900; }
.tf-run {
position: sticky;
bottom: 0;
z-index: 20; width:100%; height:32px; margin-top:3px; border:0; border-radius:11px; color:white; font-weight:800; font-size:13px; letter-spacing:.25px; cursor:pointer;
  background:linear-gradient(90deg, #7c3aed, #a855f7 52%, #6d28d9); box-shadow:0 10px 24px rgba(124,58,237,.25); transition:.18s ease; }
.tf-run:hover { filter:brightness(1.08); transform:translateY(-1px); }
.tf-header { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 1px 3px; }
.tf-brand { display:flex; align-items:center; gap:11px; min-width:0; }
.tf-hat { width:30px; height:30px; border-radius:8px; display:grid; place-content:center; font-size:28px; color:#c084fc;
  background:radial-gradient(circle at 30% 25%, rgba(168,85,247,.30), rgba(76,29,149,.10) 62%, transparent 70%); border:1px solid rgba(168,85,247,.28); }
.tf-brand-title { font-size:14px; font-weight:900; letter-spacing:.6px; white-space:nowrap; }
.tf-brand-title span { color:#a855f7; }
.tf-brand-title .tf-version {
font-size: 10px;
font-weight: 700;
letter-spacing: .4px;
color: #94a3b8;
margin-left: 6px;
vertical-align: middle;
}

.tf-brand-sub { display:flex; align-items:center; gap:8px; margin-top:2px; color:var(--tf-muted); font-size:10.5px; }
.tf-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:999px; color:#49e4aa; border:1px solid rgba(73,228,170,.35); background:rgba(73,228,170,.07); font-size:9px; font-weight:800; letter-spacing:.5px; }
.tf-badge-dot { width:6px; height:6px; border-radius:50%; background:#49e4aa; box-shadow:0 0 8px #49e4aa; }
.tf-footer-label { color:#b56cff; font-weight:800; font-size:11px; letter-spacing:.45px; text-transform:uppercase; margin:3px 2px 2px; }

.tf-view-tabs { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin:2px 0 5px; }
.tf-view-tab { height:30px; border-radius:9px; border:1px solid rgba(148,163,184,.20);
  background:rgba(15,20,32,.88); color:#aab6c8; font-size:11px; font-weight:850; cursor:pointer; }
.tf-view-tab.active { color:#fff; border-color:rgba(168,85,247,.65);
  background:linear-gradient(90deg,rgba(109,40,217,.78),rgba(168,85,247,.55)); }
.tf-forge-actions { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px; }
.tf-mini-btn { height:30px; border:1px solid rgba(148,163,184,.25); border-radius:9px;
  background:#121827; color:#eef2f7; font-size:10.5px; font-weight:800; cursor:pointer; }
.tf-mini-btn:hover { border-color:#a855f7; }
.tf-forge-help { color:#94a3b8; font-size:10px; line-height:1.35; margin-top:5px; }

`;
document.head.appendChild(style);

const panel = document.createElement('div');
panel.id = 'tower-farm-panel';
Object.assign(panel.style, {
position: 'fixed',
top: '5px',
right: '5px',
zIndex: '999999',
width: '320px',
background: 'linear-gradient(160deg, rgba(10,14,24,.985), rgba(7,10,18,.985))',
color: '#f8fafc',
border: '1px solid rgba(148,163,184,.24)',
borderRadius: '14px',
padding: '5px',
fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
fontSize: '12px',
boxShadow: '0 22px 60px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.025)',
overflow: 'visible',
transition: 'transform 0.25s ease'
});

const contentWrapper = document.createElement('div');
Object.assign(contentWrapper.style, {
maxHeight: 'calc(100vh - 10px)',
overflowY: 'auto',
overflowX: 'hidden',
paddingRight: '2px'
});
panel.appendChild(contentWrapper);

const header = document.createElement('div');
header.className = 'tf-header';
header.innerHTML = `
  <div class="tf-brand">
    <div class="tf-hat">🧙</div>
    <div>
      <div class="tf-brand-title">TOWER <span>FARM</span> <span class="tf-version">v2.1</span></div>
      <div class="tf-brand-sub">
        <span>Desenvolvido por L AURÃO</span>
        <span class="tf-badge"><span class="tf-badge-dot"></span>ATIVO</span>
      </div>
    </div>
  </div>`;
contentWrapper.appendChild(header);

const viewTabs = document.createElement('div');
viewTabs.className = 'tf-view-tabs';

const farmTabBtn = document.createElement('button');
farmTabBtn.type = 'button';
farmTabBtn.className = 'tf-view-tab active';
farmTabBtn.textContent = '🎯 FARM';

const forgeTabBtn = document.createElement('button');
forgeTabBtn.type = 'button';
forgeTabBtn.className = 'tf-view-tab';
forgeTabBtn.textContent = '⚒ FORJA';

viewTabs.appendChild(farmTabBtn);
viewTabs.appendChild(forgeTabBtn);
contentWrapper.appendChild(viewTabs);

const farmView = document.createElement('div');
const forgeView = document.createElement('div');
forgeView.style.display = 'none';

contentWrapper.appendChild(farmView);
contentWrapper.appendChild(forgeView);

function setPanelView(view) {
const forge =
view === 'forge';

farmView.style.display =
forge ? 'none' : '';

forgeView.style.display =
forge ? '' : 'none';

farmTabBtn.classList.toggle(
'active',
!forge
);

forgeTabBtn.classList.toggle(
'active',
forge
);
}

farmTabBtn.addEventListener(
'click',
() => setPanelView('farm')
);

forgeTabBtn.addEventListener(
'click',
() => {
setPanelView('forge');

setTimeout(
async () => {
/*
Durante uma Forja em andamento não sobrescrevemos o item escolhido.
*/
if (
state.forgeRunning ||
config.forgeJobActive
) {
return;
}

const backpack =
await carregarItensDaMochila();

if (
!backpack.length &&
findForgeInventoryRoot()
) {
await carregarItensDaForja();
}
},
120
);
}
);


function makeCard(icon, title, desc, colorClass) {
const card = document.createElement('div');
card.className = 'tf-card';
const iconBox = document.createElement('div');
iconBox.className = `tf-icon ${colorClass}`;
iconBox.textContent = icon;
const main = document.createElement('div');
main.className = 'tf-card-main';
const head = document.createElement('div');
head.className = 'tf-card-head';
const titleEl = document.createElement('div');
titleEl.className = `tf-card-title ${colorClass}`;
titleEl.textContent = title;
head.appendChild(titleEl);
const descEl = document.createElement('div');
descEl.className = 'tf-card-desc';
descEl.textContent = desc;
main.appendChild(head);
main.appendChild(descEl);
card.appendChild(iconBox);
card.appendChild(main);
farmView.appendChild(card);
return main;
}

function makeSelect(options, value) {
const sel = document.createElement('select');
options.forEach(([val, label]) => {
const op = document.createElement('option');
op.value = val;
op.textContent = label;
op.selected = val === value;
sel.appendChild(op);
});
return sel;
}

function makeToggle(label, checked) {
const row = document.createElement('label');
row.className = 'tf-toggle-row';
const sw = document.createElement('span');
sw.className = 'tf-switch';
const input = document.createElement('input');
input.type = 'checkbox';
input.checked = !!checked;
const slider = document.createElement('span');
slider.className = 'tf-slider';
sw.appendChild(input);
sw.appendChild(slider);
const text = document.createElement('span');
text.textContent = label;
row.appendChild(sw);
row.appendChild(text);
return { row, input };
}

function makeCheckbox(label, checked) {
const row = document.createElement('label');
row.className = 'tf-check';
const input = document.createElement('input');
input.type = 'checkbox';
input.checked = !!checked;
const span = document.createElement('span');
span.textContent = label;
row.appendChild(input);
row.appendChild(span);
return { row, input };
}

const modeMain = makeCard('🎯', 'Modo', 'Escolha o modo de automação do farm.', 'tf-purple');
const modeSelect = makeSelect([
['subirTorre', 'Subir Andar'],
['itemOrThreshold', 'Farm de itens']
], config.mode);
modeMain.appendChild(modeSelect);
modeSelect.addEventListener('change', () => {
config.mode = modeSelect.value;
saveConfig();
});

const durationMain = makeCard('◷', 'Duração', 'Selecione a duração da expedição.', 'tf-blue');
const durationSelect = makeSelect(DURACOES.map((d) => [d, d]), config.duration);
durationMain.appendChild(durationSelect);
durationSelect.addEventListener('change', () => {
config.duration = durationSelect.value;
saveConfig();
});

const thresholdMain = makeCard('↗', 'Limite da expedição (%)', 'Defina o limite de porcentagem para sair.', 'tf-cyan');
const threshold = document.createElement('input');
threshold.type = 'number';
threshold.min = '1';
threshold.max = '100';
threshold.step = '1';
threshold.value = String(config.thresholdPercent);
thresholdMain.appendChild(threshold);
threshold.addEventListener('change', () => {
let valor = Number(threshold.value);
if (!Number.isFinite(valor)) valor = 70;
valor = Math.min(100, Math.max(1, valor));
config.thresholdPercent = valor;
threshold.value = String(valor);
saveConfig();
});

const bossMain = makeCard('☠', 'Chefões', 'Ative ou desative a automação de chefões.', 'tf-red');
const bossToggle = makeToggle('Ativar chefões', config.bossMode);
bossMain.appendChild(bossToggle.row);
bossToggle.input.addEventListener('change', () => {
config.bossMode = bossToggle.input.checked;
saveConfig();
});

const inventoryMain = makeCard('🎒', 'Inventário', 'Configure a ação e as raridades do inventário.', 'tf-gold');
const actionSelect = makeSelect([
['vender', 'Vender'],
['desmontar', 'Desmontar']
], config.inventoryAction);
inventoryMain.appendChild(actionSelect);
actionSelect.addEventListener('change', () => {
config.inventoryAction = actionSelect.value;
saveConfig();
});

const raridades = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário'];
const rarityInputs = {};
const rarityGrid = document.createElement('div');
rarityGrid.className = 'tf-rarity-grid';
raridades.forEach((raridade) => {
const cb = makeCheckbox(raridade, config.sellRarities.includes(raridade));
rarityInputs[raridade] = cb.input;
rarityGrid.appendChild(cb.row);
cb.input.addEventListener('change', () => {
config.sellRarities = raridades.filter((r) => rarityInputs[r].checked);
saveConfig();
});
});
inventoryMain.appendChild(rarityGrid);

const codexCb =
makeCheckbox(
'Codex',
!!config.protectCodex
);

codexCb.row.title =
'Marcado: preserva itens das famílias do Codex nas raridades selecionadas. Desmarcado: vende/desmonta todos os itens das raridades selecionadas.';

rarityGrid.appendChild(
codexCb.row
);

codexCb.input.addEventListener(
'change',
() => {
config.protectCodex =
codexCb.input.checked;

saveConfig();
}
);


const gemsMain = makeCard('💎', 'Gemas', 'Empilhe suas gemas automaticamente.', 'tf-green');
const gemsToggle = makeToggle('Empilhar gemas automaticamente', config.autoStackGems);
gemsMain.appendChild(gemsToggle.row);
gemsToggle.input.addEventListener('change', () => {
config.autoStackGems = gemsToggle.input.checked;
saveConfig();
});

const statusLabel = document.createElement('div');
statusLabel.className = 'tf-footer-label';
statusLabel.textContent = 'ⓘ  Status';
farmView.appendChild(statusLabel);

statusEl = document.createElement('div');
statusEl.className = 'tf-status';
statusEl.textContent = state.lastLog || 'Tower Farm v2.1 carregado. Configure e aperte Iniciar.';
farmView.appendChild(statusEl);

const toggleBtn = document.createElement('button');
toggleBtn.type = 'button';
toggleBtn.className = 'tf-run';
farmView.appendChild(toggleBtn);

function updateRunButton() {
if (state.running) {
toggleBtn.textContent = '■  PARAR FARM';
toggleBtn.style.background = 'linear-gradient(90deg, #b42339, #ef4444 52%, #991b1b)';
toggleBtn.style.boxShadow = '0 10px 24px rgba(239,68,68,.22)';
} else {
toggleBtn.textContent = '▶  INICIAR FARM';
toggleBtn.style.background = 'linear-gradient(90deg, #7c3aed, #a855f7 52%, #6d28d9)';
toggleBtn.style.boxShadow = '0 10px 24px rgba(124,58,237,.25)';
}
}
updateRunButton();

toggleBtn.addEventListener('click', () => {
state.running = !state.running;
state.acting = false;
state.actingSince = 0;
updateRunButton();

if (state.running) {
state.needsMaintenance = true;
log('▶️ Farm iniciado.');
scheduleTick();
} else {
log('⏹️ Farm parado.');
}
});


// -------------------- TELA FORJA --------------------
const forgeMain = document.createElement('div');
forgeMain.className = 'tf-card';
forgeMain.innerHTML = `
  <div class="tf-icon tf-purple">⚒</div>
  <div class="tf-card-main">
    <div class="tf-card-head"><div class="tf-card-title tf-purple">Forja Automática</div></div>
    <div class="tf-card-desc">Atualize a Mochila: o Tower Farm listará todos os itens que possuem Lv/Lvl/Nível.</div>
  </div>
`;
forgeView.appendChild(forgeMain);

const forgeMainBody =
forgeMain.querySelector(
'.tf-card-main'
);

const forgeItemLabel =
document.createElement(
'div'
);
forgeItemLabel.className =
'tf-footer-label';
forgeItemLabel.textContent =
'Equipamento';
forgeMainBody.appendChild(
forgeItemLabel
);

forgeItemSelectEl =
document.createElement(
'select'
);
forgeItemSelectEl.innerHTML =
'<option value="">Carregando itens da Mochila...</option>';
forgeMainBody.appendChild(
forgeItemSelectEl
);

forgeItemSelectEl.addEventListener(
'change',
() => {
const selected =
forgeItemSelectEl.options[
forgeItemSelectEl.selectedIndex
];

const index =
Number(
selected?.dataset?.index
);

const items =
window.__towerForgeBackpackItems ||
[];

const item =
Number.isFinite(index)
? items[index]
: null;

if (item) {
config.forgeItemName =
cleanSelectedBackpackName(
selected?.textContent ||
item.name ||
selected?.dataset?.itemName ||
''
);

config.forgeItemKey =
String(
item.key ||
item.id ||
selected?.dataset?.key ||
''
);

config.forgeItemLevel =
Number(
item.level ||
selected?.dataset?.level ||
0
);

config.forgeItemRefine =
Number(
item.refine ||
selected?.dataset?.refine ||
0
);

config.forgeItemImageKey =
String(
item.imageKey ||
selected?.dataset?.imageKey ||
''
);
}

saveConfig();
}
);

const forgeTargetLabel =
document.createElement(
'div'
);
forgeTargetLabel.className =
'tf-footer-label';
forgeTargetLabel.textContent =
'Aprimorar até';
forgeTargetLabel.style.marginTop =
'6px';
forgeMainBody.appendChild(
forgeTargetLabel
);

const forgeTargetInput =
document.createElement(
'select'
);

for (
let n = 1;
n <= 15;
n += 1
) {
const op =
document.createElement(
'option'
);

op.value =
String(n);

op.textContent =
`+${n}`;

forgeTargetInput.appendChild(
op
);
}

let initialForgeTarget =
Number(
config.forgeTargetLevel
);

if (
!Number.isFinite(
initialForgeTarget
) ||
initialForgeTarget < 1 ||
initialForgeTarget > 15
) {
initialForgeTarget = 1;
}

forgeTargetInput.value =
String(
initialForgeTarget
);

forgeMainBody.appendChild(
forgeTargetInput
);

forgeTargetInput.addEventListener(
'change',
() => {
config.forgeTargetLevel =
Number(
forgeTargetInput.value
);

/*
Trabalho completo persistido:
item + nível base + refino observado + alvo.
*/
config.forgeJobActive =
true;

config.forgePendingLoad =
false;

config.forgeJobStartedAt =
Date.now();

saveConfig();
}
);

const forgeActions =
document.createElement(
'div'
);
forgeActions.className =
'tf-forge-actions';

const forgeLoadBtn =
document.createElement(
'button'
);
forgeLoadBtn.type =
'button';
forgeLoadBtn.className =
'tf-mini-btn';
forgeLoadBtn.textContent =
'↻ ATUALIZAR ITENS';

const forgeBackBtn =
document.createElement(
'button'
);
forgeBackBtn.type =
'button';
forgeBackBtn.className =
'tf-mini-btn';
forgeBackBtn.textContent =
'⌂ VOLTAR AO PAINEL';

forgeActions.appendChild(
forgeLoadBtn
);
forgeActions.appendChild(
forgeBackBtn
);
forgeMainBody.appendChild(
forgeActions
);

const forgeHelp =
document.createElement(
'div'
);
forgeHelp.className =
'tf-forge-help';
forgeHelp.textContent =
'A cada tentativa o Tower Farm volta ao painel, abre a Forja Arcana novamente, seleciona o mesmo item e repete até atingir o nível escolhido.';
forgeMainBody.appendChild(
forgeHelp
);

const forgeStatusLabel =
document.createElement(
'div'
);
forgeStatusLabel.className =
'tf-footer-label';
forgeStatusLabel.textContent =
'⚒ Status da Forja';
forgeView.appendChild(
forgeStatusLabel
);

forgeStatusEl =
document.createElement(
'div'
);
forgeStatusEl.className =
'tf-status';
forgeStatusEl.textContent =
'Forja parada. Clique em ATUALIZAR ITENS para fazer uma varredura completa da Mochila.';
forgeView.appendChild(
forgeStatusEl
);

const forgeRunBtn =
document.createElement(
'button'
);
forgeRunBtn.id =
'tf-forge-run';
forgeRunBtn.type =
'button';
forgeRunBtn.className =
'tf-run';
forgeRunBtn.textContent =
'▶  INICIAR FORJA';
forgeView.appendChild(
forgeRunBtn
);

forgeLoadBtn.addEventListener(
'click',
async () => {
if (
state.forgeRunning
) {
return;
}

/*
A listagem é da MOCHILA atual. Não é necessário abrir a Forja para
popular o dropdown.
*/
const items =
await carregarItensDaMochila();

if (
!items.length &&
findForgeInventoryRoot()
) {
await carregarItensDaForja();
}
}
);

forgeBackBtn.addEventListener(
'click',
async () => {
await voltarDoForgeAoPainel();
}
);

forgeRunBtn.addEventListener(
'click',
() => {
if (
state.forgeRunning
) {
state.forgeRunning =
false;

config.forgeJobActive =
false;
saveConfig();

forgeRunBtn.textContent =
'▶  INICIAR FORJA';

forgeLog(
'⏹️ Forja parada pelo usuário.'
);

return;
}

if (
!forgeItemSelectEl.value
) {
forgeLog(
'⚠️ Primeiro clique em CARREGAR ITENS e selecione um equipamento.'
);
return;
}

const selectedOption =
forgeItemSelectEl.options[
forgeItemSelectEl.selectedIndex
];

const selectedIndex =
Number(
selectedOption?.dataset?.index
);

const selectedItems =
window.__towerForgeBackpackItems ||
[];

const selectedItem =
Number.isFinite(
selectedIndex
)
? selectedItems[selectedIndex]
: null;

if (!selectedItem) {
forgeLog(
'⚠️ Não consegui recuperar o equipamento selecionado. Clique em ATUALIZAR ITENS novamente.'
);
return;
}

const optionHumanName =
forgeChosenBaseName(
selectedOption?.textContent ||
selectedItem.name ||
''
);

config.forgeItemName =
optionHumanName;

config.forgeItemKey =
String(
selectedItem.key ||
selectedItem.id ||
selectedOption?.dataset?.key ||
''
);

config.forgeItemLevel =
Number(
selectedItem.level ||
selectedOption?.dataset?.level ||
0
);

config.forgeItemRefine =
Number(
selectedItem.refine ||
selectedOption?.dataset?.refine ||
0
);

config.forgeItemImageKey =
String(
selectedItem.imageKey ||
selectedOption?.dataset?.imageKey ||
''
);

config.forgeTargetLevel =
Number(
forgeTargetInput.value
);

config.forgeJobActive =
true;

config.forgePendingLoad =
false;

config.forgeJobStartedAt =
Date.now();

saveConfig();

state.running =
false;

updateRunButton();

state.forgeRunning =
true;

forgeRunBtn.textContent =
'■  PARAR FORJA';

forgeLog(
`▶️ Forja iniciada: ${config.forgeItemName} até +${config.forgeTargetLevel}.`
);

forgeLoop();
}
);


const sideToggle = document.createElement('button');
sideToggle.type = 'button';
sideToggle.textContent = '>';
sideToggle.title = 'Minimizar Tower Farm';
Object.assign(sideToggle.style, {
position: 'absolute',
left: '-38px',
top: '20px',
width: '38px',
height: '54px',
padding: '0',
borderRadius: '12px 0 0 12px',
border: '1px solid rgba(148,163,184,.24)',
borderRight: '0',
background: 'linear-gradient(160deg, rgba(17,23,36,.98), rgba(8,12,21,.98))',
color: '#f8fafc',
fontSize: '24px',
fontWeight: '800',
lineHeight: '1',
cursor: 'pointer',
boxShadow: '-8px 8px 22px rgba(0,0,0,.28)'
});
panel.appendChild(sideToggle);

let painelFechado = false;
sideToggle.addEventListener('click', () => {
painelFechado = !painelFechado;
if (painelFechado) {
panel.style.transform = 'translateX(calc(100% + 14px))';
sideToggle.textContent = '<';
sideToggle.title = 'Abrir Tower Farm';
} else {
panel.style.transform = 'translateX(0)';
sideToggle.textContent = '>';
sideToggle.title = 'Minimizar Tower Farm';
}
});

document.body.appendChild(panel);

/*
Se "CARREGAR ITENS" causou uma navegação completa, a extensão foi
reiniciada nesta nova página. Retomamos a ação automaticamente.
*/
setTimeout(
async () => {
if (
config.forgePendingLoad
) {
setPanelView(
'forge'
);

forgeLog(
'🔄 Atualizando equipamentos da Forja...'
);

if (
findForgeInventoryRoot()
) {
await carregarItensDaForja();
return;
}

const tab =
findForgeUpgradeTab();

if (tab) {
simulateClick(
tab
);

await sleep(
350
);

if (
findForgeInventoryRoot()
) {
await carregarItensDaForja();
return;
}
}

/*
Pode ocorrer da página da Forja carregar primeiro o cabeçalho e só
depois o inventário. Faz algumas tentativas curtas antes de desistir.
*/
for (
let tentativa = 0;
tentativa < 8;
tentativa += 1
) {
await sleep(
500
);

if (
findForgeInventoryRoot()
) {
await carregarItensDaForja();
return;
}
}

forgeLog(
'⚠️ A Forja abriu, mas ainda não consegui localizar a lista de equipamentos.'
);
}
},
250
);
}

// ============================================================
// INICIALIZAÇÃO COM LICENÇA
// ============================================================

function startPremiumAfterLicense() {
if (!licenseActive || licensePanelBuilt) return;
licensePanelBuilt = true;
buildPanel();
setInterval(async () => {
if (!licenseActive || state.forgeRunning || !forgeItemSelectEl || forgeItemSelectEl.offsetParent === null) return;
/* Varredura pesada da Mochila continua manual pelo botão ATUALIZAR ITENS. */
}, 1500);
armLicenseRevalidation();
log('✅ Tower Farm v2.1 Premium ativado. Configure e aperte Iniciar.');
}

async function bootstrapPremiumLicense() {
const savedKey = getSavedLicenseKey();
if (!savedKey) { showLicenseGate(); return; }
showLicenseGate('Validando sua licença salva...');
const button = document.getElementById('tflic-activate');
if (button) { button.disabled = true; button.textContent = 'VALIDANDO...'; }
const result = await validatePremiumLicense(savedKey);
if (result.valid) {
licenseActive = true;
removeLicenseGate();
startPremiumAfterLicense();
return;
}
licenseActive = false;
showLicenseGate(result.message || 'Não foi possível validar sua licença.');
}

bootstrapPremiumLicense();

})();
