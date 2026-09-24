let eventoInstalacao = null;

function emitirEstadoInstalacao() {
    window.dispatchEvent(new CustomEvent('dejem-pwa-estado', {
        detail: {
            disponivel: Boolean(eventoInstalacao),
            instalado: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
        }
    }));
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    eventoInstalacao = event;
    emitirEstadoInstalacao();
});

window.addEventListener('appinstalled', () => {
    eventoInstalacao = null;
    emitirEstadoInstalacao();
});

window.DEJEMPWA = {
    podeInstalar: () => Boolean(eventoInstalacao),
    estaInstalado: () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    eIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    async instalar() {
        if (!eventoInstalacao) return { disponivel: false };

        eventoInstalacao.prompt();
        const escolha = await eventoInstalacao.userChoice;
        eventoInstalacao = null;
        emitirEstadoInstalacao();
        return { disponivel: true, aceito: escolha.outcome === 'accepted' };
    }
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch((error) => {
            console.warn('Não foi possível registrar o modo aplicativo:', error);
        });
    });
}
