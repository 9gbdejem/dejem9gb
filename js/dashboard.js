import { checkAuth } from './auth-check.js';
import { database } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

let resumoCache = [];
let metaAtual = null;
let userNivel = 3;
let filtrosDashboard = {
    codigos: [],
    opms: []
};

const CACHE_VERSION_KEY = 'escAbertasResumoVersao';
const CACHE_DATA_KEY = 'escAbertasResumoDados';

function formatarPrazo(prazo = '') {
    if (!prazo) return '-';
    return prazo;
}

function lerFiltros() {
    return filtrosDashboard;
}

function aplicarFiltrosLocal() {
    const f = lerFiltros();
    return resumoCache.filter((e) => {
        if (f.codigos.length > 0 && !f.codigos.includes(String(e.codigo || ''))) return false;
        if (f.opms.length > 0 && !f.opms.includes(String(e.opm || ''))) return false;
        return true;
    });
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function atualizarFiltros() {
    const codigos = new Map();
    const opms = new Set();

    resumoCache.forEach((item) => {
        const codigo = String(item.codigo || '').trim();
        const opm = String(item.opm || '').trim();
        if (codigo) codigos.set(codigo, String(item.composicao || '').trim());
        if (opm) opms.add(opm);
    });

    const codigosDisponiveis = [...codigos.keys()];
    const opmsDisponiveis = [...opms];
    filtrosDashboard.codigos = filtrosDashboard.codigos.filter((codigo) => codigosDisponiveis.includes(codigo));
    filtrosDashboard.opms = filtrosDashboard.opms.filter((opm) => opmsDisponiveis.includes(opm));

    const opcoesCodigo = document.getElementById('filtroDashboardCodigoOpcoes');
    if (opcoesCodigo) {
        const ordenados = codigosDisponiveis.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        opcoesCodigo.innerHTML = ordenados.length ? `
            <div class="d-flex justify-content-between align-items-center px-2 pb-2 mb-1 border-bottom">
                <span class="small fw-semibold">Códigos disponíveis</span>
                <button type="button" class="btn btn-link btn-sm p-0" id="btnLimparFiltroDashboardCodigo">Limpar</button>
            </div>
            ${ordenados.map((codigo) => `
                <div class="form-check px-2 py-1">
                    <input class="form-check-input ms-0 me-2 filtro-dashboard-codigo-check" type="checkbox"
                           id="filtroDashboardCodigo_${escaparHTML(codigo)}" value="${escaparHTML(codigo)}"
                           ${filtrosDashboard.codigos.includes(codigo) ? 'checked' : ''}>
                    <label class="form-check-label small" for="filtroDashboardCodigo_${escaparHTML(codigo)}">
                        ${escaparHTML(codigo)} - ${escaparHTML(codigos.get(codigo) || '')}
                    </label>
                </div>
            `).join('')}
        ` : '<div class="text-muted small px-2 py-1">Nenhum código disponível</div>';
    }

    const opcoesOPM = document.getElementById('filtroDashboardOpmOpcoes');
    if (opcoesOPM) {
        const ordenadas = opmsDisponiveis.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        opcoesOPM.innerHTML = ordenadas.length ? `
            <div class="d-flex justify-content-between align-items-center px-2 pb-2 mb-1 border-bottom">
                <span class="small fw-semibold">OPMs disponíveis</span>
                <button type="button" class="btn btn-link btn-sm p-0" id="btnLimparFiltroDashboardOpm">Limpar</button>
            </div>
            ${ordenadas.map((opm, indice) => `
                <div class="form-check px-2 py-1">
                    <input class="form-check-input ms-0 me-2 filtro-dashboard-opm-check" type="checkbox"
                           id="filtroDashboardOpm_${indice}" value="${escaparHTML(opm)}"
                           ${filtrosDashboard.opms.includes(opm) ? 'checked' : ''}>
                    <label class="form-check-label small" for="filtroDashboardOpm_${indice}">${escaparHTML(opm)}</label>
                </div>
            `).join('')}
        ` : '<div class="text-muted small px-2 py-1">Nenhuma OPM disponível</div>';
    }

    atualizarResumosFiltros();
}

function atualizarResumosFiltros() {
    const resumoCodigo = document.getElementById('filtroDashboardCodigoResumo');
    const resumoOPM = document.getElementById('filtroDashboardOpmResumo');
    const limparCodigo = document.getElementById('btnLimparFiltroDashboardCodigo');
    const limparOPM = document.getElementById('btnLimparFiltroDashboardOpm');

    if (resumoCodigo) {
        resumoCodigo.textContent = filtrosDashboard.codigos.length === 0
            ? 'Todos'
            : filtrosDashboard.codigos.length === 1
                ? filtrosDashboard.codigos[0]
                : `${filtrosDashboard.codigos.length} códigos selecionados`;
    }

    if (resumoOPM) {
        resumoOPM.textContent = filtrosDashboard.opms.length === 0
            ? 'Todas'
            : filtrosDashboard.opms.length === 1
                ? filtrosDashboard.opms[0]
                : `${filtrosDashboard.opms.length} OPMs selecionadas`;
    }

    if (limparCodigo) limparCodigo.classList.toggle('d-none', filtrosDashboard.codigos.length === 0);
    if (limparOPM) limparOPM.classList.toggle('d-none', filtrosDashboard.opms.length === 0);
}

function configurarFiltrosDashboard() {
    const filtroCodigo = document.getElementById('filtroDashboardCodigo');
    const filtroOPM = document.getElementById('filtroDashboardOpm');

    filtroCodigo?.addEventListener('change', (event) => {
        if (!event.target.classList.contains('filtro-dashboard-codigo-check')) return;
        filtrosDashboard.codigos = [...filtroCodigo.querySelectorAll('.filtro-dashboard-codigo-check:checked')]
            .map((checkbox) => checkbox.value);
        atualizarResumosFiltros();
        renderTabela();
    });

    filtroCodigo?.addEventListener('click', (event) => {
        if (!event.target.closest('#btnLimparFiltroDashboardCodigo')) return;
        event.preventDefault();
        filtrosDashboard.codigos = [];
        filtroCodigo.querySelectorAll('.filtro-dashboard-codigo-check').forEach((checkbox) => {
            checkbox.checked = false;
        });
        atualizarResumosFiltros();
        renderTabela();
    });

    filtroOPM?.addEventListener('change', (event) => {
        if (!event.target.classList.contains('filtro-dashboard-opm-check')) return;
        filtrosDashboard.opms = [...filtroOPM.querySelectorAll('.filtro-dashboard-opm-check:checked')]
            .map((checkbox) => checkbox.value);
        atualizarResumosFiltros();
        renderTabela();
    });

    filtroOPM?.addEventListener('click', (event) => {
        if (!event.target.closest('#btnLimparFiltroDashboardOpm')) return;
        event.preventDefault();
        filtrosDashboard.opms = [];
        filtroOPM.querySelectorAll('.filtro-dashboard-opm-check').forEach((checkbox) => {
            checkbox.checked = false;
        });
        atualizarResumosFiltros();
        renderTabela();
    });
}

function renderTabela() {
    const tbody = document.getElementById('tbodyDashboard');
    const info = document.getElementById('dashboardInfo');
    if (!tbody) return;

    const dados = aplicarFiltrosLocal();

    if (!resumoCache.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Clique no botão acima para carregar as escalas abertas.</td></tr>';
        if (info) info.textContent = metaAtual ? `Última atualização: ${metaAtual.atualizado_em || '-'}` : '';
        return;
    }

    if (!dados.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Nenhum grupo encontrado com os filtros selecionados.</td></tr>';
        if (info) info.textContent = `Mostrando 0 de ${resumoCache.length} grupo(s).`;
        return;
    }

    tbody.innerHTML = dados.map((e) => `
        <tr>
            <td class="text-center fw-semibold">${e.codigo || '-'}</td>
            <td>${e.opm || '-'}</td>
            <td>${e.composicao || '-'}</td>
            <td>${formatarPrazo(e.prazo)}</td>
            <td>${e.dias || '-'}</td>
            <td class="text-center">${e.superior ?? 0}</td>
            <td class="text-center">${e.intermed ?? 0}</td>
            <td class="text-center">${e.subalterno ?? 0}</td>
            <td class="text-center">${e.subten_sgt ?? 0}</td>
            <td class="text-center">${e.cb_sd ?? 0}</td>
            <td class="text-center fw-semibold">${e.total_geral ?? 0}</td>
        </tr>
    `).join('');

    if (info) {
        info.textContent = `Mostrando ${dados.length} de ${resumoCache.length} grupo(s). ` +
            `Total de escalas abertas: ${metaAtual?.total_escalas ?? '-'}. ` +
            `Última atualização: ${metaAtual?.atualizado_em || '-'}.`;
    }
}

function setBotaoEstado(texto, classe, disabled = false) {
    const btn = document.getElementById('btnCarregarAbertas');
    if (!btn) return;
    btn.textContent = texto;
    btn.className = `btn btn-lg w-100 ${classe}`;
    btn.disabled = disabled;
}

function carregarCacheLocal() {
    try {
        const raw = localStorage.getItem(CACHE_DATA_KEY);
        if (!raw) return [];
        const dados = JSON.parse(raw);
        return Array.isArray(dados) ? dados : [];
    } catch {
        return [];
    }
}

function salvarCacheLocal(versao, dados) {
    localStorage.setItem(CACHE_VERSION_KEY, String(versao || ''));
    localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(dados || []));
}

function renderDashboardBase() {
    const container = document.getElementById('dashboard-content');
    const filtrosContainer = document.getElementById('dashboard-filtros');
    if (!container || !filtrosContainer) return;

    filtrosContainer.innerHTML = `
        <div class="row g-2">
            <div class="col-12 col-md-6">
                <label class="form-label small fw-bold mb-1">Código de local</label>
                <div class="dropdown w-100" id="filtroDashboardCodigo">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-start" type="button"
                            data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                        <span id="filtroDashboardCodigoResumo">Todos</span>
                    </button>
                    <div class="dropdown-menu w-100 p-2 shadow-sm" id="filtroDashboardCodigoOpcoes"
                         style="max-height: 320px; overflow-y: auto; min-width: 100%;">
                        <div class="text-muted small px-2 py-1">Carregando...</div>
                    </div>
                </div>
            </div>
            <div class="col-12 col-md-6">
                <label class="form-label small fw-bold mb-1">OPM</label>
                <div class="dropdown w-100" id="filtroDashboardOpm">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-start" type="button"
                            data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                        <span id="filtroDashboardOpmResumo">Todas</span>
                    </button>
                    <div class="dropdown-menu w-100 p-2 shadow-sm" id="filtroDashboardOpmOpcoes"
                         style="max-height: 320px; overflow-y: auto; min-width: 100%;">
                        <div class="text-muted small px-2 py-1">Carregando...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="mb-3">
            <div id="dashboardInfo" class="small text-muted text-center mt-2"></div>
        </div>

        <div class="table-responsive">
            <table class="table table-sm table-striped align-middle">
                <thead>
                    <tr>
                        <th class="text-center">Código</th>
                        <th>OPM</th>
                        <th>Composição</th>
                        <th>Prazo</th>
                        <th>Dias</th>
                        <th class="text-center">Sup</th>
                        <th class="text-center">Cap</th>
                        <th class="text-center">Ten</th>
                        <th class="text-center">Sgt</th>
                        <th class="text-center">CbSd</th>
                        <th class="text-center">Total</th>
                    </tr>
                </thead>
                <tbody id="tbodyDashboard"></tbody>
            </table>
        </div>

        <hr>
        <div class="text-center text-muted small">
            <div><strong>Sistema de Gestão de Escalas</strong> - Versão 1.0.1</div>
            <div>Desenvolvido por Cabo PM Alexandre Alves Ferreira</div>
            <div>© 2026 Corpo de Bombeiros do Estado de São Paulo. Todos os direitos reservados.</div>
        </div>
    `;
}

async function carregarMetaEscalasAbertas() {
    const snap = await get(ref(database, 'Esc_AbertasMeta'));
    return snap.exists() ? snap.val() : null;
}

async function carregarResumoEscalasAbertas() {
    const snap = await get(ref(database, 'Esc_AbertasResumo'));
    if (!snap.exists()) return [];

    return Object.values(snap.val() || {}).sort((a, b) => {
        const cod = String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true });
        if (cod !== 0) return cod;
        return String(a.prazo || '').localeCompare(String(b.prazo || ''), 'pt-BR');
    });
}

async function baixarResumoPorClique() {
    try {
        setBotaoEstado('Baixando escalas abertas... aguarde.', 'btn-primary', true);
        resumoCache = await carregarResumoEscalasAbertas();
        salvarCacheLocal(metaAtual?.versao, resumoCache);
        atualizarFiltros();
        renderTabela();

        if (resumoCache.length) {
            setBotaoEstado('Tabela de escalas abertas já atualizada', 'btn-success', false);
        } else {
            setBotaoEstado('Não há escalas abertas', 'btn-secondary', true);
        }
    } catch (error) {
        setBotaoEstado('Erro ao baixar escalas abertas. Clique para tentar novamente.', 'btn-danger', false);
        console.error('Erro ao baixar Esc_AbertasResumo:', error);
    }
}

async function prepararBotaoResumo() {
    metaAtual = await carregarMetaEscalasAbertas();
    const btn = document.getElementById('btnCarregarAbertas');
    if (btn) btn.addEventListener('click', baixarResumoPorClique);

    if (!metaAtual || Number(metaAtual.total_grupos || 0) === 0) {
        resumoCache = [];
        atualizarFiltros();
        renderTabela();
        setBotaoEstado('Não há escalas abertas', 'btn-secondary', true);
        return;
    }

    const versaoCache = localStorage.getItem(CACHE_VERSION_KEY);

    if (versaoCache && String(metaAtual.versao || '') === versaoCache) {
        resumoCache = carregarCacheLocal();
        atualizarFiltros();
        renderTabela();
        if (resumoCache.length) {
            setBotaoEstado('Tabela de escalas abertas já atualizada', 'btn-success', false);
        } else {
            setBotaoEstado('Clique aqui para atualizar a tabela abaixo, pois há novas escalas', 'btn-warning', false);
        }
    } else {
        await baixarResumoPorClique();
        return;
        resumoCache = [];
        atualizarFiltros();
        renderTabela();
        setBotaoEstado('Clique aqui para atualizar a tabela abaixo, pois há novas escalas', 'btn-warning', false);
    }
}

export async function initDashboard() {
    try {
        const { userData } = await checkAuth(3);
        userNivel = userData.nivel || 3;

        renderDashboardBase();
        configurarFiltrosDashboard();

        await prepararBotaoResumo();
    } catch (error) {
        const container = document.getElementById('dashboard-content');
        if (container) container.innerHTML = `<div class="alert alert-danger">Erro ao carregar dashboard: ${error.message}</div>`;
    }
}

if (!window.location.pathname.includes('app.html') && !document.getElementById('app-content')) {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch {}
        await initDashboard();
    });
}
