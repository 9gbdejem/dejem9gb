import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { database } from './firebase-config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const PERFIS_TEMPORARIOS = {
    '777777': { perfil: 'COBOM_TEMPORARIO', nivel: 2, podeConfirmarEscalas: true },
    '555555': { perfil: 'PRONTIDAO_TEMPORARIO', nivel: 3, somenteLeitura: true }
};

// Verificar autenticação e nível de acesso
export function checkAuth(requiredLevel = 1) {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            try {
                // 1. PEGAR O RE DO STORAGE
                let userRE = sessionStorage.getItem('userRE');
                if (!userRE) userRE = localStorage.getItem('userRE');
                
                if (!userRE) {
                    throw new Error('RE não encontrado');
                }

                // 2. BUSCAR DADOS DO USUÁRIO
                const loginSnap = await get(ref(database, `login/${userRE}`));
                const efetivoRef = ref(database, `efetivo/${userRE}`);
                const [snapshot, permissoesSnap] = await Promise.all([get(efetivoRef), get(ref(database, `permissoes/${userRE}`))]);

                if (!snapshot.exists() && !loginSnap.exists() && !PERFIS_TEMPORARIOS[userRE]) {
                    throw new Error('Dados do usuário não encontrados');
                }

                const efetivoData = snapshot.exists() ? snapshot.val() : {};
                const loginData = loginSnap.exists() ? loginSnap.val() : {};
                const permissoesData = permissoesSnap.exists() ? permissoesSnap.val() : {};
                const perfilTemporario = PERFIS_TEMPORARIOS[userRE] || {};
                const nomePadrao = loginData.nome_completo || loginData.nome || efetivoData.nome_completo || efetivoData.nome || perfilTemporario.nome || userRE;
                const emailPadrao = loginData.mail_funcional || loginData.email || efetivoData.mail_funcional || efetivoData.email || perfilTemporario.email || user.email;
                const userData = { ...efetivoData, ...loginData, ...permissoesData, ...perfilTemporario, nome: nomePadrao, nome_completo: nomePadrao, email: emailPadrao, mail_funcional: emailPadrao };
                const userLevel = Number(perfilTemporario.nivel ?? permissoesData.nivel ?? efetivoData.nivel ?? 3);
                const expectedEmail = String(userData.mail_funcional || userData.email || '').toLowerCase();
                if (userData.uid && userData.uid !== user.uid) throw new Error('UsuÃ¡rio autenticado nÃ£o confere com o RE.');
                if (expectedEmail && expectedEmail !== String(user.email || '').toLowerCase()) {
                    throw new Error('E-mail autenticado nÃ£o confere com o cadastro.');
                }
                const now = new Date().toISOString();
                await update(ref(database, `login/${userRE}`), { atualizado_em: now });
                sessionStorage.setItem('userNivel', String(userLevel));
                sessionStorage.setItem('currentUserLevel', String(userLevel));
                
                if (userLevel <= requiredLevel) {
                    resolve({ 
                        user, 
                        userData,
                        re: userRE
                    });
                } else {
                    // ✅ CORRIGIDO: Mostra msgbox e redireciona CORRETAMENTE
                    
                    // SALVAR O NÍVEL ATUAL ANTES DO ALERT (para navbar carregar certo)
                    sessionStorage.setItem('currentUserLevel', userLevel);
                    
                    // Msgbox
                    alert(`🚫 Acesso Negado!\n\nCaso necessário, contate o B/3.`);
                    
                    // ✅ CORRIGIDO: Redirecionar como se fosse um clique normal
                    // Isso evita problemas com SPA/recarregamentos
                    if (window.location.pathname.includes('app.html')) {
                        // Se estiver no SPA, navega via SPA
                        if (window.app && window.app.loadPage) {
                            window.app.loadPage('app.html');
                        } else {
                            window.location.href = 'app.html';
                        }
                    } else {
                        // Se for página independente, redireciona normal
                        window.location.href = 'app.html';
                    }
                    
                    // Rejeita a promise para interromper a execução
                    reject(new Error(`Nível insuficiente: ${userLevel} < ${requiredLevel}`));
                }

            } catch (error) {
                console.error('💥 Erro ao verificar acesso:', error.message);
                
                // Se não for erro de nível, faz logout normalmente
                if (!error.message.includes('Nível insuficiente')) {
                    alert('Erro ao verificar permissões.');
                    clearUserData();
                    window.location.href = 'index.html';
                }
                reject(error);
            }
        });
    });
}

// Limpar dados do usuário
function clearUserData() {
    sessionStorage.removeItem('userRE');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userNivel');
    sessionStorage.removeItem('currentUserLevel');
    sessionStorage.removeItem('dejemPaginaAtual');
    localStorage.removeItem('userRE');
    localStorage.removeItem('userName');
    localStorage.removeItem('userNivel');
}

export async function loadNavbar() {
    
    // ✅ CORRIGIDO: Verificar se navbar já foi carregada
    const existingNavbar = document.getElementById('navbar');
    if (existingNavbar && existingNavbar.innerHTML.trim() !== '') {
        configurarFechamentoDropdownsNavbar();
        return true;
    }
    
    // Verificar se o elemento existe
    let navbarElement = document.getElementById('navbar');
    if (!navbarElement) {
        console.error('❌ Elemento #navbar não encontrado, criando...');
        navbarElement = document.createElement('div');
        navbarElement.id = 'navbar';
        document.body.insertBefore(navbarElement, document.body.firstChild);
    }
    
    try {
        // Tentar carregar o navbar
        const response = await fetch('components/navbar.html');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // ✅ CORRIGIDO: Inserir SEMPRE, mas verificar se já tem conteúdo
        if (navbarElement.innerHTML.trim() === '') {
            navbarElement.innerHTML = html;
        } else {
        }

        configurarFechamentoDropdownsNavbar();
        
        // ✅ CORRIGIDO: Ocultar itens por nível DEPOIS de garantir que navbar carregou
        setTimeout(() => {
            // Aguardar um pouco mais para garantir que todos os elementos estão no DOM
            setTimeout(hideNavbarItemsByLevel, 200);
        }, 100);
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao carregar navbar:', error.message);
        
        // Fallback básico APENAS se não tiver conteúdo
        if (!navbarElement.innerHTML.trim()) {
            navbarElement.innerHTML = createFallbackNavbar();
        }

        configurarFechamentoDropdownsNavbar();
        
        return false;
    }
}

// ✅ CORRIGIDO: Função melhorada para ocultar itens
async function hideNavbarItemsByLevel() {
    try {
        // Pegar nível do usuário (de sessionStorage primeiro)
        let userLevel = sessionStorage.getItem('currentUserLevel');
        
        // Se não tiver no session, buscar do Firebase
        if (!userLevel) {
            let userRE = sessionStorage.getItem('userRE');
            if (!userRE) return;
            
            const [snapshot, permissoesSnap] = await Promise.all([
                get(ref(database, `efetivo/${userRE}`)),
                get(ref(database, `permissoes/${userRE}`))
            ]);
            
            if (!snapshot.exists()) return;
            
            const userData = snapshot.exists() ? snapshot.val() : {};
            const permissoes = permissoesSnap.exists() ? permissoesSnap.val() : {};
            userLevel = permissoes.nivel || userData.nivel || 3;
            sessionStorage.setItem('currentUserLevel', userLevel);
        }
        
        
        // Aguardar um pouco mais para garantir que elementos foram renderizados
        await new Promise(resolve => setTimeout(resolve, 300));

        // Nível 3 (usuário normal) - só vê Dashboard e Escalas
        if (parseInt(userLevel) >= 3) {
            hideElement('#navExclusoes');
            // ✅ ADICIONAR ESTA LINHA: Ocultar Solicitações também
            hideElement('#navSolicitacoes');
        }

        configurarFechamentoDropdownsNavbar();

        // Sino e sirene são exclusivos do nível 1, inclusive nas páginas
        // carregadas fora do app.html.
        const acoesSolicitacoes = document.getElementById('navbarSolicitacoesTesteAcoes');
        if (acoesSolicitacoes) {
            const mostrarAcoes = parseInt(userLevel) === 1;
            acoesSolicitacoes.classList.toggle('d-none', !mostrarAcoes);
            acoesSolicitacoes.classList.toggle('d-flex', mostrarAcoes);
            acoesSolicitacoes.style.setProperty('display', mostrarAcoes ? 'flex' : 'none', 'important');
        }

        
        // Nível 2 e 1 - vê tudo
        
    } catch (error) {
        console.error('❌ Erro ao ajustar navbar:', error);
        // Tentar novamente depois de 1 segundo
        setTimeout(hideNavbarItemsByLevel, 1000);
    }
}

// ✅ CORRIGIDO: Função melhorada para ocultar elemento
function hideElement(selector, retryCount = 0) {
    const element = document.querySelector(selector);
    if (element) {
        // Encontra o li pai e oculta
        const parentLi = element.closest('li.nav-item');
        if (parentLi) {
            parentLi.style.display = 'none';
            return true;
        }
    }
    
    // Se não encontrou, tenta novamente (máx 3 tentativas)
    if (retryCount < 3) {
        setTimeout(() => hideElement(selector, retryCount + 1), 500);
    }
    
    return false;
}

// Navbar de fallback
function createFallbackNavbar() {
    return `
        <nav class="navbar navbar-dark">
            <div class="container-fluid">
                <a class="navbar-brand" href="dashboard.html">Sistema</a>
                <div>
                    <a href="dashboard.html" class="btn btn-outline-light btn-sm me-2">
                        Dashboard
                    </a>
                    <a href="escalas.html" class="btn btn-outline-light btn-sm me-2">
                        Escalas
                    </a>
                    <button class="btn btn-outline-light btn-sm" 
                            onclick="sessionStorage.clear(); window.location.href='index.html'">
                        Sair
                    </button>
                </div>
            </div>
        </nav>
    `;
}

// Atualizar timer no navbar
function updateTimerInNavbar(timeRemaining) {
    if (window.navbarFunctions && window.navbarFunctions.updateTimer) {
        window.navbarFunctions.updateTimer(timeRemaining);
    } else {
        // Fallback: atualizar depois de 1 segundo
        setTimeout(() => {
            if (window.navbarFunctions && window.navbarFunctions.updateTimer) {
                window.navbarFunctions.updateTimer(timeRemaining);
            }
        }, 1000);
    }
}

// Carregar informações do usuário no navbar
function loadUserInfoInNavbar() {
    if (window.navbarFunctions && window.navbarFunctions.loadUserInfo) {
        window.navbarFunctions.loadUserInfo();
    }
}

// Modifique a função updateSessionTimer para integrar com navbar
export function updateSessionTimer() {
    const expiryTime = parseInt(sessionStorage.getItem('sessionExpiryTime'));
    if (!expiryTime) return;
    
    const currentTime = Date.now();
    const timeRemaining = Math.max(0, expiryTime - currentTime);
    
    // Usar o novo sistema de timer
    updateNavbarTimer(timeRemaining);
    
    if (timeRemaining <= 0) {
        performNavbarLogout();
    }
}

// ✅ NOVA FUNÇÃO: Verificar e mostrar mensagem de acesso negado
export function checkAccessDeniedMessage() {
    const deniedMessage = sessionStorage.getItem('accessDeniedMessage');
    if (deniedMessage) {
        // Mostrar alerta
        alert(deniedMessage);
        
        // Remover mensagem
        sessionStorage.removeItem('accessDeniedMessage');
        
        return true;
    }
    return false;
}

// ✅ NOVA FUNÇÃO: Navegação segura para dashboard
export function safeRedirectToDashboard() {
    
    // Limpar qualquer estado de erro
    sessionStorage.removeItem('accessDeniedMessage');
    
    if (window.location.pathname.includes('app.html')) {
        // Se estiver no SPA
        if (window.app && typeof window.app.loadPage === 'function') {
            window.app.loadPage('dashboard.html');
        } else {
            // Fallback para navegação normal
            window.location.href = 'dashboard.html';
        }
    } else {
        // Páginas independentes
        window.location.href = 'dashboard.html';
    }
}

function configurarFechamentoDropdownsNavbar() {
    if (window.dejemFechamentoDropdownsNavbarConfigurado) return;

    window.dejemFechamentoDropdownsNavbarConfigurado = true;

    // Fecha imediatamente quando o toque/clique começar fora de um dropdown.
    document.addEventListener('pointerdown', (event) => {
        if (!event.target.closest('#navbar .navbar')) {
            fecharDropdownsNavbar();
            fecharMenuRetratilNavbar();
        }
    }, true);

    document.addEventListener('click', (event) => {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;

        const itemNavegacao = event.target.closest('#navbar .nav-link[href], #navbar .dropdown-item[href]');
        if (itemNavegacao && !itemNavegacao.matches('[data-bs-toggle="dropdown"]')) {
            fecharDropdownsNavbar();
            fecharMenuRetratilNavbar();
            return;
        }

        const toggle = event.target.closest('#navbar [data-bs-toggle="dropdown"]');
        if (toggle) {
            fecharDropdownsNavbar(toggle);
            return;
        }

        const itemMenu = event.target.closest('#navbar .dropdown-menu a[href], #navbar .dropdown-menu button.dropdown-item');
        if (itemMenu) {
            fecharDropdownsNavbar();
            return;
        }

        if (event.target.closest('#navbar .dropdown-menu')) {
            setTimeout(() => fecharDropdownsNavbar(), 0);
            return;
        }

        if (!event.target.closest('#navbar .dropdown')) {
            fecharDropdownsNavbar();
        }

        if (!event.target.closest('#navbar .navbar')) {
            fecharMenuRetratilNavbar();
        }
    });
}

function fecharMenuRetratilNavbar() {
    const menu = document.getElementById('mainNavbar');
    if (!menu || !menu.classList.contains('show')) return;

    try {
        if (typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
            bootstrap.Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
        }
    } catch (error) {
        console.warn('Não foi possível recolher o menu pelo Bootstrap.', error);
    }

    // Fallback para garantir o recolhimento mesmo se o Bootstrap falhar.
    menu.classList.remove('show');
    document.querySelector('#navbar .navbar-toggler')?.setAttribute('aria-expanded', 'false');
}

function fecharDropdownsNavbar(toggleMantido = null) {
    document.querySelectorAll('#navbar [data-bs-toggle="dropdown"]').forEach((toggle) => {
        if (toggle === toggleMantido) return;

        try {
            if (typeof bootstrap !== 'undefined' && bootstrap.Dropdown) {
                bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
            }
        } catch (error) {
            console.warn('Não foi possível fechar o dropdown pelo Bootstrap.', error);
        }

        // Fallback forçado: funciona mesmo se o Bootstrap não concluir o hide.
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('show');
        const dropdown = toggle.closest('.dropdown');
        dropdown?.classList.remove('show');
        dropdown?.querySelectorAll('.dropdown-menu').forEach((menu) => {
            menu.classList.remove('show');
            menu.removeAttribute('data-popper-placement');
            menu.style.removeProperty('position');
            menu.style.removeProperty('inset');
            menu.style.removeProperty('margin');
            menu.style.removeProperty('transform');
        });

        if (toggle.id === 'userGreetingDropdown') {
            toggle.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            toggle.style.backgroundColor = 'transparent';
        }
    });
}
