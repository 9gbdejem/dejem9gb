import { checkAuth, loadNavbar } from './auth-check.js';
import { database } from './firebase-config.js';
import { get, ref, set } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

let inicializado = false;
let prontoParaPesquisar = false;
let eventosGlobaisCienciaConfigurados = false;

function escaparHTML(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function mostrarMensagem(texto, tipo = 'info') {
    const elemento = document.getElementById('mensagemProximas');
    if (!elemento) return;

    elemento.className = `alert alert-${tipo}`;
    elemento.textContent = texto;
}

function limparMensagem() {
    const elemento = document.getElementById('mensagemProximas');
    if (!elemento) return;
    elemento.className = 'alert d-none';
    elemento.textContent = '';
}

function definirCarregamento(carregando) {
    const botao = document.getElementById('btnPesquisarProximas');
    const corpo = document.getElementById('proximasEscalasBody');
    if (!botao || !corpo) return;

    botao.disabled = carregando;
    botao.innerHTML = carregando
        ? '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Pesquisando...'
        : '<i class="fas fa-search me-1"></i>Pesquisar';

    if (carregando) {
        corpo.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status"></div>
                    <div class="text-muted mt-2">Consultando as próximas escalas...</div>
                </td>
            </tr>`;
    }
}

function obterTimestampEscala(item) {
    const data = String(item?.Data_Esc || '').trim();
    const hora = String(item?.Horario_Inicial || '00:00').trim();
    const partes = data.split('/');
    if (partes.length !== 3) return Number.MAX_SAFE_INTEGER;
    const [dia, mes, ano] = partes.map(Number);
    const [horas, minutos] = hora.split(':').map(Number);
    return new Date(ano, (mes || 1) - 1, dia || 1, horas || 0, minutos || 0).getTime();
}

function formatarStatus(status) {
    const valor = String(status || '').trim().toLowerCase();
    if (!valor) return '';
    return valor.charAt(0).toUpperCase() + valor.slice(1);
}

function normalizarEscalas(dados) {
    if (!dados || typeof dados !== 'object') return [];

    return Object.entries(dados)
        .map(([id, item]) => ({
            ...(item || {}),
            ID_Escala: item?.ID_Escala || id
        }))
        .sort((a, b) => obterTimestampEscala(a) - obterTimestampEscala(b));
}

function exibirEscalas(re, escalas, ciencias = {}) {
    const corpo = document.getElementById('proximasEscalasBody');
    const resumo = document.getElementById('resumoProximas');
    if (!corpo || !resumo) return;

    const reLogado = String(sessionStorage.getItem('userRE') || '').replace(/\D/g, '');
    const podeRegistrarCiencia = reLogado === String(re).replace(/\D/g, '');

    if (escalas.length === 0) {
        corpo.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    Nenhuma próxima escala encontrada para o RE ${escaparHTML(re)}.
                </td>
            </tr>`;
        resumo.className = 'alert alert-secondary mb-3';
        resumo.textContent = `RE ${re}: nenhuma escala futura ou do dia.`;
        return;
    }

    corpo.innerHTML = escalas.map((item) => {
        const idEscala = String(item.ID_Escala || '').trim();
        const ciente = ciencias[idEscala] === true;
        const status = formatarStatus(item.Status);
        const tituloCiencia = ciente
            ? 'Ciente'
            : (podeRegistrarCiencia ? 'Registrar ciência' : 'Somente o RE do militar pode registrar ciência');

        return `
        <tr>
            <td>${escaparHTML(item.Data_Esc || '-')}</td>
            <td>${escaparHTML(item.Horario_Inicial || '-')} - ${escaparHTML(item.Horario_Final || '-')}</td>
            <td>${escaparHTML(item.OPM_Nome || '-')}</td>
            <td>${escaparHTML(item.Composicao_Nome || '-')}</td>
            <td>${escaparHTML(idEscala || '-')}</td>
            <td>
                <button type="button"
                        class="btn btn-sm btn-ciencia ${ciente ? 'ciente' : ''}"
                        data-re="${escaparHTML(re)}"
                        data-id-escala="${escaparHTML(idEscala)}"
                        title="${escaparHTML(tituloCiencia)}"
                        ${ciente ? 'disabled' : ''}>
                    ${ciente ? 'Ciente' : 'Ciência'}
                </button>
                ${status ? `<span class="badge status-badge ms-1">${escaparHTML(status)}</span>` : ''}
            </td>
        </tr>
        `;
    }).join('');

    resumo.className = 'alert alert-success mb-3';
    resumo.textContent = `RE ${re}: ${escalas.length} próxima(s) escala(s) encontrada(s).`;
}

async function pesquisarProximas(reInformado = '') {
    const input = document.getElementById('inputREProximas');
    const re = String(reInformado || input?.value || '').replace(/\D/g, '');
    if (input) input.value = re;

    limparMensagem();
    if (!/^\d{6}$/.test(re)) {
        mostrarMensagem('Informe um RE com exatamente 6 dígitos.', 'warning');
        input?.focus();
        return;
    }

    definirCarregamento(true);
    try {
        const [snapshot, cienciaSnapshot] = await Promise.all([
            get(ref(database, `proximasEscalas/${re}`)),
            get(ref(database, `cienciaProximasEscalas/${re}`))
        ]);
        const escalas = snapshot.exists() ? normalizarEscalas(snapshot.val()) : [];
        const ciencias = cienciaSnapshot.exists() ? (cienciaSnapshot.val() || {}) : {};
        exibirEscalas(re, escalas, ciencias);
    } catch (error) {
        console.error('Erro ao consultar próximas escalas:', error);
        const corpo = document.getElementById('proximasEscalasBody');
        if (corpo) {
            corpo.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Não foi possível consultar as próximas escalas.</td></tr>';
        }
        mostrarMensagem('Não foi possível consultar o Firebase. Tente novamente.', 'danger');
    } finally {
        definirCarregamento(false);
    }
}

function limparPesquisa() {
    const input = document.getElementById('inputREProximas');
    const corpo = document.getElementById('proximasEscalasBody');
    const resumo = document.getElementById('resumoProximas');
    if (input) {
        input.value = '';
        input.focus();
    }
    if (corpo) {
        corpo.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Informe o RE para consultar as próximas escalas.</td></tr>';
    }
    if (resumo) resumo.className = 'd-none';
    limparMensagem();
}

async function configurarPaginaPorNivel() {
    const formulario = document.getElementById('formPesquisarProximas');
    const painelPesquisa = formulario?.closest('.search-panel');
    const input = document.getElementById('inputREProximas');
    const reLogado = String(sessionStorage.getItem('userRE') || '').replace(/\D/g, '');
    const nivel = Number(sessionStorage.getItem('userNivel') || 3);

    if (nivel === 1) {
        painelPesquisa?.classList.remove('d-none');
        limparPesquisa();
        return;
    }

    painelPesquisa?.classList.add('d-none');
    if (!/^\d{6}$/.test(reLogado)) {
        mostrarMensagem('Não foi possível identificar o RE do usuário autenticado.', 'danger');
        return;
    }

    if (input) input.value = reLogado;
    await pesquisarProximas(reLogado);
}

export async function initProximasEscalas() {
    // Registra o bloqueio do envio HTML antes da validação do Firebase.
    // Isso evita que um clique rápido recarregue o app.html com "?".
    configurarEventosProximas();
    configurarEventosGlobaisCiencia();

    // A SPA recria o HTML ao voltar para esta página, mas mantém o módulo em cache.
    // Nesse caso, os eventos precisam ser ligados novamente ao novo botão.
    if (inicializado) {
        await configurarPaginaPorNivel();
        return;
    }
    inicializado = true;

    try {
        const { userData, re } = await checkAuth(3);
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userNivel', String(userData.nivel || 3));
        sessionStorage.setItem('currentUserLevel', String(userData.nivel || 3));

        if (window.updateUserGreetingInSPA) window.updateUserGreetingInSPA();
        prontoParaPesquisar = true;
        await configurarPaginaPorNivel();
    } catch (error) {
        console.error('Erro ao carregar próximas escalas:', error);
    }
}

function configurarEventosProximas() {
    const form = document.getElementById('formPesquisarProximas');
    const input = document.getElementById('inputREProximas');
    const pesquisar = document.getElementById('btnPesquisarProximas');
    const limpar = document.getElementById('btnLimparProximas');
    if (!form || form.dataset.eventosConfigurados === '1') return;

    form.dataset.eventosConfigurados = '1';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!prontoParaPesquisar) {
            mostrarMensagem('Aguarde o carregamento do sistema.', 'info');
            return false;
        }
        pesquisarProximas();
    });
    pesquisar?.addEventListener('click', (event) => {
        event.preventDefault();
        if (!prontoParaPesquisar) {
            mostrarMensagem('Aguarde o carregamento do sistema.', 'info');
            return;
        }
        pesquisarProximas();
    });
    input?.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
    });
    input?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        if (!prontoParaPesquisar) {
            mostrarMensagem('Aguarde o carregamento do sistema.', 'info');
            return;
        }
        pesquisarProximas();
    });
    limpar?.addEventListener('click', limparPesquisa);
}

function configurarEventosGlobaisCiencia() {
    if (eventosGlobaisCienciaConfigurados) return;
    eventosGlobaisCienciaConfigurados = true;

    document.addEventListener('click', async (event) => {
        const botaoCiencia = event.target.closest('.btn-ciencia');
        if (!botaoCiencia || botaoCiencia.classList.contains('ciente') || botaoCiencia.disabled) return;

        event.preventDefault();
        const re = String(botaoCiencia.dataset.re || '').trim();
        const idEscala = String(botaoCiencia.dataset.idEscala || '').trim();
        const reLogado = String(sessionStorage.getItem('userRE') || '').replace(/\D/g, '');
        if (!/^\d{6}$/.test(re) || !idEscala) return;
        if (re !== reLogado) {
            mostrarMensagem('A ciência só pode ser registrada pelo militar da própria escala.', 'warning');
            return;
        }

        botaoCiencia.disabled = true;
        try {
            // RE e ID_Escala são a própria chave; o Firebase recebe somente o valor true.
            await set(ref(database, `cienciaProximasEscalas/${re}/${idEscala}`), true);
            botaoCiencia.classList.add('ciente');
            botaoCiencia.textContent = 'Ciente';
            botaoCiencia.title = 'Ciente';
        } catch (error) {
            console.error('Erro ao registrar ciência da escala:', error);
            botaoCiencia.disabled = false;
            mostrarMensagem('Não foi possível registrar a ciência. Tente novamente.', 'danger');
        }
    });
}

if (!window.location.pathname.includes('app.html')) {
    document.addEventListener('DOMContentLoaded', async () => {
        await initProximasEscalas();
        await loadNavbar();
    });
}

export default initProximasEscalas;
