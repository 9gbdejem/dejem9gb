import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getDatabase, get, ref } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

const CONFIG_URL_GERAL = 'https://gblaureas-default-rtdb.firebaseio.com/firebase-config.json';
const POSTOS_OFICIAIS = new Set([
    'CEL PM',
    'TEN CEL PM',
    'MAJ PM',
    'CAP PM',
    '1. TEN PM',
    '2. TEN PM'
]);

let databaseGeral = null;
const cacheMilitares = new Map();

function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function primeiroValor(...valores) {
    return valores.find(valor => String(valor || '').trim() !== '') || '';
}

function nomeGuerraParaExibicao(nomeGuerra, nomeCompleto) {
    const nomeInformado = String(nomeGuerra || '').trim();
    if (nomeInformado) return nomeInformado;

    const partes = String(nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
    return partes.length ? partes[partes.length - 1] : '';
}

async function obterDatabaseGeral() {
    if (databaseGeral) return databaseGeral;

    const resposta = await fetch(CONFIG_URL_GERAL);
    if (!resposta.ok) throw new Error(`Não foi possível consultar o Firebase Geral (HTTP ${resposta.status}).`);

    const configuracao = await resposta.json();
    if (!configuracao?.geralConfig) throw new Error('Configuração do Firebase Geral não encontrada.');

    const app = getApps().find(item => item.name === 'geral9gb') ||
        initializeApp(configuracao.geralConfig, 'geral9gb');
    databaseGeral = getDatabase(app);
    return databaseGeral;
}

export function postoEhOficial(posto) {
    return POSTOS_OFICIAIS.has(normalizarTexto(posto));
}

export async function obterMilitarGeral(reInformado, ignorarCache = false) {
    const re = String(reInformado || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(re)) return null;
    if (!ignorarCache && cacheMilitares.has(re)) return cacheMilitares.get(re);

    const db = await obterDatabaseGeral();
    const [efetivoSnap, permissaoSnap] = await Promise.all([
        get(ref(db, `efetivo9gb/${re}`)),
        get(ref(db, `permissao_login/${re}`))
    ]);

    if (!efetivoSnap.exists() && !permissaoSnap.exists()) {
        cacheMilitares.set(re, null);
        return null;
    }

    const efetivo = efetivoSnap.exists() ? efetivoSnap.val() : {};
    const permissao = permissaoSnap.exists() ? permissaoSnap.val() : {};
    const militar = {
        re,
        nome_completo: primeiroValor(efetivo.nome_completo, efetivo.nome, permissao.nome_completo, permissao.nome),
        nome_guerra: primeiroValor(
            efetivo.nome_guerra,
            efetivo.nome_de_guerra,
            efetivo.nomeGuerra,
            permissao.nome_guerra,
            permissao.nome_de_guerra,
            permissao.nomeGuerra
        ),
        post_grad: primeiroValor(efetivo.post_grad, efetivo.posto_grad, permissao.post_grad, permissao.posto_grad),
        opm: String(primeiroValor(efetivo.opm, permissao.opm) || ''),
        email: primeiroValor(efetivo.mail_funcional, efetivo.email, permissao.mail_funcional, permissao.email)
    };
    militar.nome_exibicao = nomeGuerraParaExibicao(militar.nome_guerra, militar.nome_completo);
    militar.oficial = postoEhOficial(militar.post_grad);

    cacheMilitares.set(re, militar);
    return militar;
}

export async function obterAcessoDejemOficiais(userData = {}, reInformado = '') {
    const re = String(reInformado || sessionStorage.getItem('userRE') || '').replace(/\D/g, '');
    const nivel = Number(userData.nivel ?? sessionStorage.getItem('currentUserLevel') ?? 3);
    const administrador = nivel === 1;
    const militar = await obterMilitarGeral(re);

    return {
        permitido: administrador || Boolean(militar?.oficial),
        administrador,
        nivel,
        re,
        militar
    };
}

export async function atualizarVisibilidadeMenuDejemOficiais(userData = null) {
    const item = document.getElementById('navDejemOficiais')?.closest('li.nav-item');
    if (!item) return;

    try {
        const acesso = await obterAcessoDejemOficiais(userData || {}, sessionStorage.getItem('userRE'));
        item.classList.toggle('d-none', !acesso.permitido);
    } catch (error) {
        item.classList.add('d-none');
        console.error('Erro ao validar o acesso à DEJEM dos Oficiais:', error);
    }
}
