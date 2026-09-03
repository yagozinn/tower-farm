// ==UserScript==
// @name         Tower Farm
// @namespace    tower-farm
// @version      1.14
// @description  Tower Farm público - Subir Andar e Farm de itens.
// @match        https://towerofmages.online/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
'use strict';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const STORAGE_KEY = 'towerFarm.public.config.v1';
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
bossMode: false,
inventoryAction: 'vender',
sellRarities: ['Comum'],
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
// Recurso exclusivo da versão Premium.
async function empilharGemas() {
return false;
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
// Limpeza automática de inventário é exclusiva da versão Premium.
async function runInventoryCleanup() {
return false;
}

async function executarManutencao() {
/*
Na versão pública não vende/desmonta itens e não empilha gemas.
Apenas volta para a área de expedição quando necessário.
*/
try {
await voltarPraExpedicao();
} catch {}

await sleep(
250
);
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
false
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
// A automação de Forja não faz parte da edição pública.

// ============================================================
// PAINEL
// ============================================================

function buildPanel() {
const old =
document.getElementById(
'tower-farm-panel'
);

if (old) {
old.remove();
}

const oldStyle =
document.getElementById(
'tower-farm-panel-style'
);

if (oldStyle) {
oldStyle.remove();
}

const style =
document.createElement(
'style'
);

style.id =
'tower-farm-panel-style';

style.textContent = `
#tower-farm-panel,
#tower-farm-panel * {
box-sizing:border-box;
}
#tower-farm-panel {
--bg:rgba(10,14,24,.98);
--card:rgba(17,23,36,.93);
--border:rgba(148,163,184,.18);
--text:#f8fafc;
--muted:#9aa8bd;
--purple:#a855f7;
--purple2:#7c3aed;
--green:#35e0a1;
position:fixed;
top:8px;
right:8px;
z-index:2147483647;
width:320px;
max-height:calc(100vh - 16px);
overflow:auto;
padding:7px;
border:1px solid var(--border);
border-radius:14px;
background:var(--bg);
box-shadow:0 18px 50px rgba(0,0,0,.45);
color:var(--text);
font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
font-size:12px;
}
#tower-farm-panel button,
#tower-farm-panel select,
#tower-farm-panel input {
font:inherit;
}
.tf-head {
display:flex;
align-items:center;
justify-content:space-between;
gap:8px;
padding:1px 2px 6px;
}
.tf-brand {
display:flex;
align-items:center;
gap:8px;
min-width:0;
}
.tf-logo {
width:34px;
height:34px;
display:grid;
place-items:center;
border-radius:9px;
font-size:27px;
background:linear-gradient(145deg,#142033,#0d1320);
border:1px solid rgba(168,85,247,.35);
}
.tf-title {
font-size:16px;
font-weight:900;
letter-spacing:.6px;
white-space:nowrap;
}
.tf-title b {
color:#b56cff;
}
.tf-version {
margin-left:5px;
font-size:10px;
color:#94a3b8;
font-weight:800;
}
.tf-sub {
font-size:10.5px;
color:#9aa8bd;
margin-top:2px;
}
.tf-active {
display:flex;
align-items:center;
gap:5px;
padding:5px 8px;
border-radius:999px;
border:1px solid rgba(53,224,161,.4);
background:rgba(16,185,129,.1);
color:#4cf0b1;
font-size:10px;
font-weight:900;
}
.tf-active::before {
content:"";
width:6px;
height:6px;
border-radius:50%;
background:#35e0a1;
box-shadow:0 0 10px #35e0a1;
}
.tf-tabs {
display:grid;
grid-template-columns:1fr 1fr;
gap:6px;
margin-bottom:6px;
}
.tf-tab {
height:35px;
border-radius:10px;
border:1px solid rgba(148,163,184,.22);
background:#121827;
color:#a9b5c7;
font-weight:900;
cursor:pointer;
}
.tf-tab.active {
color:#fff;
border-color:#9b5cff;
background:linear-gradient(135deg,#6d28d9,#9333ea);
}
.tf-view {
display:none;
}
.tf-view.active {
display:block;
}
.tf-card {
display:grid;
grid-template-columns:34px minmax(0,1fr);
gap:7px;
padding:7px;
margin:4px 0;
border:1px solid var(--border);
border-radius:12px;
background:linear-gradient(145deg,rgba(20,27,42,.96),rgba(12,17,28,.96));
}
.tf-icon {
width:34px;
height:34px;
display:grid;
place-items:center;
border-radius:9px;
border:1px solid #a855f7;
color:#c084fc;
font-size:17px;
}
.tf-card-title {
font-size:11px;
font-weight:900;
letter-spacing:.4px;
text-transform:uppercase;
color:#bd7aff;
margin-bottom:2px;
}
.tf-desc {
color:var(--muted);
font-size:10.8px;
line-height:1.4;
}
.tf-label {
margin:6px 2px 3px;
font-size:10px;
font-weight:900;
color:#bd7aff;
text-transform:uppercase;
}
#tower-farm-panel select,
#tower-farm-panel input[type="number"] {
width:100%;
height:34px;
padding:0 12px;
border-radius:10px;
border:1px solid rgba(148,163,184,.28);
outline:none;
background:#101625;
color:#fff;
}
#tower-farm-panel select:focus,
#tower-farm-panel input:focus {
border-color:#a855f7;
box-shadow:0 0 0 3px rgba(168,85,247,.12);
}
.tf-status {
position:relative;
min-height:34px;
padding:7px 8px 7px 31px;
margin-top:4px;
border-radius:11px;
border:1px solid rgba(53,224,161,.28);
background:linear-gradient(90deg,rgba(20,83,67,.27),rgba(18,24,37,.9) 28%);
line-height:1.35;
}
.tf-status::before {
content:"✓";
position:absolute;
left:8px;
top:50%;
transform:translateY(-50%);
width:16px;
height:16px;
display:grid;
place-items:center;
border-radius:50%;
background:rgba(53,224,161,.16);
color:#35e0a1;
font-weight:900;
}
.tf-run {
width:100%;
height:36px;
margin-top:5px;
border:0;
border-radius:11px;
color:#fff;
font-weight:900;
cursor:pointer;
background:linear-gradient(90deg,#7c3aed,#a855f7 52%,#6d28d9);
box-shadow:0 8px 22px rgba(124,58,237,.25);
}
.tf-premium-hero {
padding:11px;
border-radius:12px;
border:1px solid rgba(168,85,247,.35);
background:
radial-gradient(circle at top right,rgba(168,85,247,.18),transparent 42%),
linear-gradient(145deg,#151b2b,#0d1220);
}
.tf-premium-title {
font-size:15px;
font-weight:950;
color:#d8b4fe;
margin-bottom:5px;
}
.tf-premium-copy {
font-size:11px;
line-height:1.45;
color:#aab6c8;
}
.tf-benefits {
display:grid;
gap:5px;
margin:9px 0;
}
.tf-benefit {
padding:7px 8px;
border:1px solid rgba(148,163,184,.14);
border-radius:9px;
background:rgba(255,255,255,.025);
color:#e7edf6;
font-size:11px;
}
.tf-benefit strong {
color:#c084fc;
}
.tf-discord {
display:flex;
align-items:center;
justify-content:center;
gap:9px;
width:100%;
height:39px;
border:0;
border-radius:10px;
background:#5865F2;
color:white;
font-weight:900;
text-decoration:none;
cursor:pointer;
}
.tf-discord svg {
width:20px;
height:20px;
fill:currentColor;
}
.tf-note {
margin-top:7px;
text-align:center;
font-size:10px;
color:#8290a6;
}
.tf-side {
position:absolute;
left:-38px;
top:18px;
width:38px;
height:54px;
border:1px solid rgba(148,163,184,.24);
border-right:0;
border-radius:12px 0 0 12px;
background:#101625;
color:#fff;
font-size:23px;
font-weight:900;
cursor:pointer;
}
`;

document.head.appendChild(
style
);

const panel =
document.createElement(
'div'
);

panel.id =
'tower-farm-panel';

const head =
document.createElement(
'div'
);

head.className =
'tf-head';

head.innerHTML = `
<div class="tf-brand">
  <div class="tf-logo">🧙</div>
  <div>
    <div class="tf-title">TOWER <b>FARM</b><span class="tf-version">v1.14</span></div>
    <div class="tf-sub">Desenvolvido por L AURÃO</div>
  </div>
</div>
<div class="tf-active">ATIVO</div>
`;

panel.appendChild(
head
);

const tabs =
document.createElement(
'div'
);

tabs.className =
'tf-tabs';

const farmTab =
document.createElement(
'button'
);

farmTab.className =
'tf-tab active';

farmTab.textContent =
'🎯 FARM';

const premiumTab =
document.createElement(
'button'
);

premiumTab.className =
'tf-tab';

premiumTab.textContent =
'👑 PREMIUM';

tabs.appendChild(
farmTab
);

tabs.appendChild(
premiumTab
);

panel.appendChild(
tabs
);

const farmView =
document.createElement(
'div'
);

farmView.className =
'tf-view active';

const premiumView =
document.createElement(
'div'
);

premiumView.className =
'tf-view';

panel.appendChild(
farmView
);

panel.appendChild(
premiumView
);

function showView(name) {
const farm =
name === 'farm';

farmView.classList.toggle(
'active',
farm
);

premiumView.classList.toggle(
'active',
!farm
);

farmTab.classList.toggle(
'active',
farm
);

premiumTab.classList.toggle(
'active',
!farm
);
}

farmTab.addEventListener(
'click',
() =>
showView(
'farm'
)
);

premiumTab.addEventListener(
'click',
() =>
showView(
'premium'
)
);

function makeCard(icon,title,desc) {
const card =
document.createElement(
'div'
);

card.className =
'tf-card';

card.innerHTML = `
<div class="tf-icon">${icon}</div>
<div>
  <div class="tf-card-title">${title}</div>
  <div class="tf-desc">${desc}</div>
</div>
`;

farmView.appendChild(
card
);

return card.children[1];
}

function makeSelect(options,value) {
const select =
document.createElement(
'select'
);

for (const [val,label] of options) {
const op =
document.createElement(
'option'
);

op.value =
val;

op.textContent =
label;

op.selected =
val === value;

select.appendChild(
op
);
}

return select;
}

/*
Versão pública: somente Subir Andar e Farm de itens.
*/
const modeBody =
makeCard(
'🎯',
'Modo',
'Escolha entre subir os andares automaticamente ou permanecer farmando itens.'
);

const modeSelect =
makeSelect(
[
['subirTorre','Subir Andar'],
['itemOrThreshold','Farm de itens']
],
config.mode
);

modeBody.appendChild(
modeSelect
);

modeSelect.addEventListener(
'change',
() => {
config.mode =
modeSelect.value;

saveConfig();
}
);

const durationBody =
makeCard(
'◷',
'Duração',
'Selecione a duração usada nas expedições.'
);

const durationSelect =
makeSelect(
DURACOES.map(
(d) => [d,d]
),
config.duration
);

durationBody.appendChild(
durationSelect
);

durationSelect.addEventListener(
'change',
() => {
config.duration =
durationSelect.value;

saveConfig();
}
);

const thresholdBody =
makeCard(
'↗',
'Limite da expedição',
'No Farm de itens, define a porcentagem usada como limite para saída.'
);

const threshold =
document.createElement(
'input'
);

threshold.type =
'number';

threshold.min =
'1';

threshold.max =
'100';

threshold.step =
'1';

threshold.value =
String(
config.thresholdPercent
);

thresholdBody.appendChild(
threshold
);

threshold.addEventListener(
'change',
() => {
let value =
Number(
threshold.value
);

if (
!Number.isFinite(
value
)
) {
value =
70;
}

value =
Math.min(
100,
Math.max(
1,
value
)
);

config.thresholdPercent =
value;

threshold.value =
String(
value
);

saveConfig();
}
);

const statusLabel =
document.createElement(
'div'
);

statusLabel.className =
'tf-label';

statusLabel.textContent =
'ⓘ Status';

farmView.appendChild(
statusLabel
);

statusEl =
document.createElement(
'div'
);

statusEl.className =
'tf-status';

statusEl.textContent =
state.lastLog ||
'Tower Farm v1.14 carregado.';

farmView.appendChild(
statusEl
);

const runBtn =
document.createElement(
'button'
);

runBtn.className =
'tf-run';

farmView.appendChild(
runBtn
);

function updatePublicRunButton() {
if (
state.running
) {
runBtn.textContent =
'■  PARAR FARM';

runBtn.style.background =
'linear-gradient(90deg,#b42339,#ef4444 52%,#991b1b)';
} else {
runBtn.textContent =
'▶  INICIAR FARM';

runBtn.style.background =
'linear-gradient(90deg,#7c3aed,#a855f7 52%,#6d28d9)';
}
}

updatePublicRunButton();

runBtn.addEventListener(
'click',
() => {
state.running =
!state.running;

state.acting =
false;

state.actingSince =
0;

updatePublicRunButton();

if (
state.running
) {
/*
Sem manutenção Premium.
*/
state.needsMaintenance =
false;

log(
'▶️ Farm iniciado.'
);

scheduleTick();
} else {
log(
'⏹️ Farm parado.'
);
}
}
);

/*
Aba Premium: apenas apresentação e contato.
*/
premiumView.innerHTML = `
<div class="tf-premium-hero">
  <div class="tf-premium-title">👑 Torne-se Premium</div>
  <div class="tf-premium-copy">
    Desbloqueie os recursos avançados do Tower Farm e automatize muito mais do seu progresso.
  </div>

  <div class="tf-benefits">
    <div class="tf-benefit">⚒️ <strong>Forja Automática</strong><br>Selecione o equipamento e o refino desejado; o Tower Farm cuida do processo.</div>
    <div class="tf-benefit">🎒 <strong>Gerenciamento de Inventário</strong><br>Recursos avançados para organizar e tratar os itens coletados.</div>
    <div class="tf-benefit">💎 <strong>Automação de Gemas</strong><br>Mais comodidade para administrar as gemas durante o farm.</div>
    <div class="tf-benefit">✨ <strong>Mais automações</strong><br>A versão Premium recebe os recursos avançados e futuras funções exclusivas.</div>
  </div>

  <a class="tf-discord" href="https://discord.gg/vyd2NAVzPP" target="_blank" rel="noopener noreferrer">
    <svg viewBox="0 0 127.14 96.36" aria-hidden="true">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.27 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-9.39 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77.25 77.25 0 0 0 6.89 9.39 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.16ZM42.45 65.69C36.18 65.69 31 59.94 31 52.86s5.07-12.84 11.43-12.84 11.54 5.8 11.43 12.84c0 7.08-5.07 12.83-11.41 12.83Zm42.24 0c-6.27 0-11.43-5.75-11.43-12.83s5.07-12.84 11.43-12.84 11.54 5.8 11.43 12.84c0 7.08-5.02 12.83-11.43 12.83Z"/>
    </svg>
    ENTRE EM CONTATO
  </a>

  <div class="tf-note">Fale com a gente no Discord para saber como ter acesso à versão Premium.</div>
</div>
`;

const side =
document.createElement(
'button'
);

side.className =
'tf-side';

side.type =
'button';

side.textContent =
'>';

panel.appendChild(
side
);

let closed =
false;

side.addEventListener(
'click',
() => {
closed =
!closed;

panel.style.transform =
closed
? 'translateX(calc(100% + 12px))'
: 'translateX(0)';

side.textContent =
closed
? '<'
: '>';
}
);

document.body.appendChild(
panel
);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

buildPanel();

log(
'✅ Tower Farm v1.14 público carregado. Configure e aperte Iniciar.'
);

})();

