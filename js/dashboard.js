import { checkAuth } from './auth-check.js';
import { database } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

let escalasCache = [];
let userNivel = 3;

const formatarData = (dataIso = '') => {
    const [ano, mes, dia] = dataIso.split('-');
    return (ano && mes && dia) ? `${dia}/${mes}/${ano}` : '-';
};

const formatarPrazo = (prazo = '') => {
    if (!prazo) return '-';
    const d = new Date(prazo);
    if (Number.isNaN(d.getTime())) return prazo;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

export function calcularHorarioFinal(inicio) {
    if (!inicio || !inicio.includes(':')) return '--:--';
    const [h, m] = inicio.split(':').map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    dt.setHours(dt.getHours() + 8);
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function lerFiltros() {
    return {
        data: document.getElementById('filtroData')?.value || '',
        local: document.getElementById('filtroLocal')?.value || '',
        composicao: document.getElementById('filtroComposicao')?.value || '',
        codigo: document.getElementById('filtroCodigo')?.value || '',
        postoSubSgt: document.getElementById('filtroSubSgt')?.checked ?? true,
        postoCbSd: document.getElementById('filtroCbSd')?.checked ?? true
    };
}

function aplicarFiltrosLocal() {
    const f = lerFiltros();
    return escalasCache.filter((e) => {
        if (f.data && e.Data !== f.data) return false;
        if (f.local && e.OPM_Nome !== f.local) return false;
        if (f.composicao && e.Composicao_Nome !== f.composicao) return false;
        if (f.codigo && String(e.Composicao_Cod) !== String(f.codigo)) return false;

        const okSubSgt = f.postoSubSgt && Number(e.Solic_Subten_Sgt || 0) > 0;
        const okCbSd = f.postoCbSd && Number(e.Solic_Cb_Sd || 0) > 0;
        if (!okSubSgt && !okCbSd) return false;
        return true;
    });
}

function renderTabela() {
    const tbody = document.getElementById('tbodyDashboard');
    if (!tbody) return;

    const dados = aplicarFiltrosLocal();
    if (!dados.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4">Nenhuma escala aberta encontrada.</td></tr>';
        return;
    }
    
    tbody.innerHTML = dados.map((e) => {
        const horarioFinal = calcularHorarioFinal(e.Horario_Inicial);
        return `
            <tr>
                <td>${formatarData(e.Data)}</td>
                <td class="text-center">${e.Solic_Subten_Sgt ?? 0}</td>
                <td class="text-center">${e.Solic_Cb_Sd ?? 0}</td>
                ${userNivel === 1 ? `<td class="text-center">${e.Solic_Superior ?? 0}</td><td class="text-center">${e.Solic_Intermed ?? 0}</td><td class="text-center">${e.Solic_Subalterno ?? 0}</td>` : ''}
                <td>${e.OPM_Nome || '-'}</td>
                <td>${e.Composicao_Nome || '-'}</td>
                <td>${e.Horario_Inicial || '--:--'} às ${horarioFinal}</td>
                <td class="text-center">${e.Composicao_Cod ?? '-'}</td>
                <td>${formatarPrazo(e.Prazo_Inscricao)}</td>
            </tr>
        `;
    }).join('');
}

function preencherSelect(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">Todos</option>' + [...new Set(values)].filter(Boolean).sort().map(v => `<option value="${v}">${v}</option>`).join('');
}

function renderDashboardBase() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    container.innerHTML = `
        <div class="row g-2 mb-3">
            <div class="col-md-2"><label class="form-label">Data</label><select id="filtroData" class="form-select form-select-sm"></select></div>
            <div class="col-md-2"><label class="form-label">Local</label><select id="filtroLocal" class="form-select form-select-sm"></select></div>
            <div class="col-md-3"><label class="form-label">Composição</label><select id="filtroComposicao" class="form-select form-select-sm"></select></div>
            <div class="col-md-2"><label class="form-label">Código</label><select id="filtroCodigo" class="form-select form-select-sm"></select></div>
            <div class="col-md-3">
                <label class="form-label d-block">Posto</label>
                <div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="filtroSubSgt" checked><label class="form-check-label" for="filtroSubSgt">Subten/Sgt</label></div>
                <div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="filtroCbSd" checked><label class="form-check-label" for="filtroCbSd">Cb/Sd</label></div>
            </div>
        </div>

        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead>
                    <tr>
                        <th>DATA</th><th>SUBTEN/SGT</th><th>CB/SD</th>
                        ${userNivel === 1 ? '<th>SUPERIOR</th><th>INTERMED</th><th>SUBALTERNO</th>' : ''}
                        <th>LOCAL</th><th>COMPOSIÇÃO</th><th>HORÁRIO</th><th>CÓDIGO</th><th>PRAZO INSCRIÇÃO</th>
                    </tr>
                </thead>
                <tbody id="tbodyDashboard"></tbody>
            </table>
        </div>

        <hr>
        <div class="text-center text-muted small">
            <div><strong>Sistema de Gestão de Escalas</strong> - Versão 1.0.0</div>
            <div>Desenvolvido por Cabo PM Alexandre Alves Ferreira</div>
            <div>© 2026 Polícia Militar do Estado de São Paulo. Todos os direitos reservados.</div>
        </div>
    `;
}

async function carregarEscalasAbertas() {
    const snap = await get(ref(database, 'Esc_Abertas'));
    const lista = [];
    if (!snap.exists()) return lista;

    Object.entries(snap.val()).forEach(([ano, meses]) => {
        Object.entries(meses || {}).forEach(([mes, dias]) => {
            Object.entries(dias || {}).forEach(([dia, opms]) => {
                Object.entries(opms || {}).forEach(([opm, comps]) => {
                    Object.entries(comps || {}).forEach(([comp, solicitacoes]) => {
                        Object.entries(solicitacoes || {}).forEach(([idSolicitacao, dados]) => {
                            if ((dados?.Status_Adm || '').toUpperCase() !== 'ABERTA') return;
                            lista.push({ ...dados, id_solicitacao: idSolicitacao, ano, mes, dia, opm, comp });
                        });
                    });
                });
            });
        });
    });

    lista.sort((a, b) => new Date(a.Prazo_Inscricao) - new Date(b.Prazo_Inscricao));
    return lista;
}

export async function initDashboard() {
    try {
        const { userData } = await checkAuth(3);
        userNivel = userData.nivel;

        renderDashboardBase();
        escalasCache = await carregarEscalasAbertas();

        preencherSelect('filtroData', escalasCache.map(e => e.Data));
        preencherSelect('filtroLocal', escalasCache.map(e => e.OPM_Nome));
        preencherSelect('filtroComposicao', escalasCache.map(e => e.Composicao_Nome));
        preencherSelect('filtroCodigo', escalasCache.map(e => String(e.Composicao_Cod || '')));

        ['filtroData', 'filtroLocal', 'filtroComposicao', 'filtroCodigo', 'filtroSubSgt', 'filtroCbSd'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', renderTabela);
        });

        renderTabela();
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