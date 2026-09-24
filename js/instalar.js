import { checkAuth, loadNavbar } from './auth-check.js';
import './pwa.js';

let autenticacaoVerificada = false;
let eventosConfigurados = false;

function obterElementos() {
    return {
        botao: document.getElementById('btnInstalarAplicativo'),
        mensagem: document.getElementById('mensagemInstalacao'),
        instrucoesAndroid: document.getElementById('instrucoesAndroidDesktop'),
        instrucoesIOS: document.getElementById('instrucoesIOS'),
        status: document.getElementById('statusInstalacao')
    };
}

function mostrarMensagem(texto, tipo = 'info') {
    const { mensagem } = obterElementos();
    if (!mensagem) return;
    mensagem.className = `alert alert-${tipo} mb-0`;
    mensagem.textContent = texto;
}

function atualizarTelaInstalacao() {
    const { botao, instrucoesAndroid, instrucoesIOS, status } = obterElementos();
    if (!botao || !status) return;

    const pwa = window.DEJEMPWA;
    const eIOS = pwa?.eIOS?.() || false;
    const instalado = pwa?.estaInstalado?.() || false;
    const disponivel = pwa?.podeInstalar?.() || false;

    instrucoesAndroid?.classList.toggle('d-none', eIOS);
    instrucoesIOS?.classList.toggle('d-none', !eIOS);

    if (instalado) {
        botao.disabled = true;
        botao.innerHTML = '<i class="fas fa-check me-2"></i>Aplicativo já instalado';
        status.className = 'badge text-bg-success';
        status.textContent = 'Instalado';
        return;
    }

    if (eIOS) {
        botao.disabled = false;
        botao.innerHTML = '<i class="fas fa-mobile-screen-button me-2"></i>Ver como instalar no iPhone/iPad';
        status.className = 'badge text-bg-warning';
        status.textContent = 'Instalação pelo Safari';
        return;
    }

    if (disponivel) {
        botao.disabled = false;
        botao.innerHTML = '<i class="fas fa-download me-2"></i>Instalar aplicativo';
        status.className = 'badge text-bg-primary';
        status.textContent = 'Pronto para instalar';
        return;
    }

    botao.disabled = true;
    botao.innerHTML = '<i class="fas fa-clock me-2"></i>Preparando instalação...';
    status.className = 'badge text-bg-secondary';
    status.textContent = 'Use o menu do navegador';
}

async function acionarInstalacao() {
    const pwa = window.DEJEMPWA;
    if (!pwa) return;

    if (pwa.eIOS()) {
        mostrarMensagem('No Safari, toque em Compartilhar, selecione “Adicionar à Tela de Início” e confirme em “Adicionar”.', 'warning');
        return;
    }

    const resultado = await pwa.instalar();
    if (!resultado.disponivel) {
        mostrarMensagem('A instalação ainda não está disponível. Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.', 'info');
        atualizarTelaInstalacao();
        return;
    }

    mostrarMensagem(resultado.aceito ? 'Instalação confirmada pelo navegador.' : 'Instalação cancelada.', resultado.aceito ? 'success' : 'secondary');
    atualizarTelaInstalacao();
}

function configurarEventos() {
    if (eventosConfigurados) return;
    eventosConfigurados = true;

    document.addEventListener('click', (event) => {
        if (event.target.closest('#btnInstalarAplicativo')) acionarInstalacao();
    });
    window.addEventListener('dejem-pwa-estado', atualizarTelaInstalacao);
}

export async function initInstalar() {
    configurarEventos();
    atualizarTelaInstalacao();

    if (!autenticacaoVerificada) {
        await checkAuth(3);
        autenticacaoVerificada = true;
    }

    atualizarTelaInstalacao();
}

if (!window.location.pathname.includes('app.html')) {
    document.addEventListener('DOMContentLoaded', async () => {
        await initInstalar();
        await loadNavbar();
    });
}
