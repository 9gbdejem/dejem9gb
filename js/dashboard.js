import { checkAuth } from './auth-check.js';
import { database } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

let resumoCache = [];
let metaAtual = null;
let userNivel = 3;

const CACHE_VERSION_KEY = 'escAbertasResumoVersao';
const CACHE_DATA_KEY = 'escAbertasResumoDados';

function formatarPrazo(prazo = '') {
    if (!prazo) return '-';
    return prazo;
}

function lerFiltros() {
    return {
        codigo: document.getElementById('filtroCodigo')?.value || '',
        local: document.getElementById('filtroLocal')?.value || '',
        composicao: document.getElementById('filtroComposicao')?.value || ''
    };
}

function aplicarFiltrosLocal() {
    const f = lerFiltros();
    return resumoCache.filter((e) => {
        if (f.codigo && String(e.codigo) !== String(f.codigo)) return false;
        if (f.local && e.opm !== f.local) return false;
        if (f.composicao && e.composicao !== f.composicao) return false;
        return true;
    });
}

function preencherSelect(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">Todos</option>' + [...new Set(values)]
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }))
        .map(v => `<option value="${v}">${v}</option>`)
        .join('');
}

function atualizarFiltros() {
    preencherSelect('filtroCodigo', resumoCache.map(e => String(e.codigo || '')));
    preencherSelect('filtroLocal', resumoCache.map(e => e.opm));
    preencherSelect('filtroComposicao', resumoCache.map(e => e.composicao));
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
            `Total de escalas abertas: ${metaAtual?.total_escalas ?? '-'}.`;
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
    if (!container) return;

    container.innerHTML = `
        <div class="mb-3">
            <button id="btnCarregarAbertas" type="button" class="btn btn-lg btn-secondary w-100">
                Verificando escalas abertas...
            </button>
            <div id="dashboardInfo" class="small text-muted text-center mt-2"></div>
        </div>

        <div class="row g-2 mb-3">
            <div class="col-md-2">
                <label class="form-label">Código</label>
                <select id="filtroCodigo" class="form-select form-select-sm"></select>
            </div>
            <div class="col-md-4">
                <label class="form-label">OPM</label>
                <select id="filtroLocal" class="form-select form-select-sm"></select>
            </div>
            <div class="col-md-6">
                <label class="form-label">Composição</label>
                <select id="filtroComposicao" class="form-select form-select-sm"></select>
            </div>
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
                        <th class="text-center">Int</th>
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
            <div><strong>Sistema de Gestão de Escalas</strong> - Versão 1.0.0</div>
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
    if (!btn) return;

    btn.addEventListener('click', baixarResumoPorClique);

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

        ['filtroCodigo', 'filtroLocal', 'filtroComposicao'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', renderTabela);
        });

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
