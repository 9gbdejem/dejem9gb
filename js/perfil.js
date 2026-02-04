// perfil.js - Sistema de Perfil do Usuário (SPA Compatível)
import { checkAuth } from './auth-check.js';
import { auth } from './firebase-config.js';
import { 
    reauthenticateWithCredential,
    EmailAuthProvider,
    updatePassword 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { database } from './firebase-config.js';

// Cache de dados do usuário
let userDataCache = null;
let userRE = null;

// Exportar funções principais para SPA
export async function initPerfilSPA() {
    console.log('🚀 Perfil inicializando (SPA)...');
    await initPerfil();
}

export async function initPerfil() {
    try {
        // 1. Verificar autenticação (qualquer nível)
        const { userData, re } = await checkAuth(3);
        userDataCache = userData;
        userRE = re;
        
        // 2. Garantir dados no sessionStorage
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        // 3. Atualizar userGreeting no SPA
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        // 4. Renderizar perfil
        renderPerfil(userData, re);
        
        // 5. Adicionar listeners
        setupEventListeners();
        
        console.log('✅ Perfil carregado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro no perfil:', error);
        showPerfilError(error);
    }
}

// Função para gerar avatar com iniciais
function generateAvatar(nomeCompleto) {
    if (!nomeCompleto || nomeCompleto.trim() === '') {
        return '??';
    }
    
    const nomeLimpo = nomeCompleto
        .replace(/\.{3,}/g, '')
        .replace(/\s*\(.*\)/g, '')
        .trim();
    
    const partes = nomeLimpo.split(' ');
    
    if (partes.length === 1) {
        // Se só tem um nome, pega as duas primeiras letras
        return partes[0].substring(0, 2).toUpperCase();
    } else {
        // Primeira letra do primeiro nome + primeira letra do último sobrenome
        const primeiroNome = partes[0];
        const ultimoSobrenome = partes[partes.length - 1];
        return (primeiroNome.charAt(0) + ultimoSobrenome.charAt(0)).toUpperCase();
    }
}

// Função para renderizar o perfil
function renderPerfil(userData, re) {
    const perfilContent = document.querySelector('#perfil-content') || 
                         document.querySelector('.card-body');
    
    if (!perfilContent) {
        console.warn('⚠️ Elemento do perfil não encontrado');
        return;
    }
    
    // Verificar se o usuário tem email no Firebase Auth
    const currentUser = auth.currentUser;
    const userEmail = currentUser ? currentUser.email : 'Não disponível';
    
    // Gerar avatar
    const avatarIniciais = generateAvatar(userData.nome);
    
    // Determinar nível textual
    let nivelTexto = 'Básico';
    if (userData.nivel === 1) nivelTexto = 'Administrador';
    else if (userData.nivel === 2) nivelTexto = 'Moderador';
    
    perfilContent.innerHTML = `
        <div class="row">
            <!-- Coluna Esquerda - Dados do Usuário -->
            <div class="col-md-4">
                <!-- Quadro 1: Avatar e Informações -->
                <div class="card mb-3">
                    <div class="card-body text-center">
                        <!-- Avatar -->
                        <div class="avatar-circle mb-3" style="
                            width: 100px;
                            height: 100px;
                            background-color: #8B0000; /* Vinho */
                            color: white;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 32px;
                            font-weight: bold;
                            margin: 0 auto;
                        ">
                            ${avatarIniciais}
                        </div>
                        
                        <h4 class="card-title">${userData.nome}</h4>
                        
                        <div class="user-info text-start mt-4">
                            <div class="mb-2">
                                <strong><i class="fas fa-id-card me-2"></i>RE:</strong>
                                <span class="float-end">${re}</span>
                            </div>
                            
                            <div class="mb-2">
                                <strong><i class="fas fa-envelope me-2"></i>E-mail:</strong>
                                <span class="float-end" style="font-size: 0.9em;">${userEmail}</span>
                            </div>
                            
                            <div class="mb-3">
                                <strong><i class="fas fa-shield-alt me-2"></i>Nível:</strong>
                                <span class="float-end badge bg-secondary">${nivelTexto}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Quadro 2: Links -->
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title mb-3">
                            <i class="fas fa-cog me-2"></i>OPÇÕES
                        </h6>
                        
                        <div class="list-group list-group-flush">
                            <a href="#" class="list-group-item list-group-item-action active" id="link-alterar-senha">
                                <i class="fas fa-key me-2"></i>Alterar Senha
                            </a>
                            <!-- Futuros links podem ser adicionados aqui -->
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Coluna Direita - Conteúdo Dinâmico -->
            <div class="col-md-8">
                <div class="card">
                    <div class="card-body">
                        <div id="perfil-conteudo-dinamico">
                            <!-- Conteúdo será carregado dinamicamente quando clicar nos links -->
                            <div class="text-center py-5">
                                <i class="fas fa-user-circle text-muted" style="font-size: 64px;"></i>
                                <h4 class="mt-3">Selecione uma opção</h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Função para mostrar formulário de alteração de senha
function showAlterarSenhaForm() {
    const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
    if (!conteudoDinamico) return;
    
    conteudoDinamico.innerHTML = `
        <h4 class="mb-4">
            <i class="fas fa-key me-2"></i>Alterar Senha
        </h4>
        
        <form id="form-alterar-senha">
            <!-- Senha Atual -->
            <div class="mb-3">
                <label for="senha-atual" class="form-label">
                    <i class="fas fa-lock me-1"></i>Senha Atual
                </label>
                <div class="input-group">
                    <input type="password" 
                           class="form-control" 
                           id="senha-atual" 
                           required
                           placeholder="Digite sua senha atual">
                    <button class="btn btn-outline-secondary" type="button" id="toggle-senha-atual">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                <div class="form-text">Digite a senha que você está usando atualmente.</div>
            </div>
            
            <!-- Nova Senha -->
            <div class="mb-3">
                <label for="nova-senha" class="form-label">
                    <i class="fas fa-lock me-1"></i>Nova Senha
                </label>
                <div class="input-group">
                    <input type="password" 
                           class="form-control" 
                           id="nova-senha" 
                           required
                           placeholder="Digite a nova senha"
                           minlength="8">
                    <button class="btn btn-outline-secondary" type="button" id="toggle-nova-senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                
                <!-- Indicador de Força da Senha -->
                <div class="mt-2">
                    <div class="progress" style="height: 8px;">
                        <div id="senha-strength-bar" class="progress-bar" 
                             style="width: 0%; transition: width 0.3s;"></div>
                    </div>
                    <div class="d-flex justify-content-between mt-1">
                        <small id="senha-strength-text" class="text-muted">Força da senha: Muito fraca</small>
                        <small id="senha-criteria"></small>
                    </div>
                </div>
                
                <!-- Critérios da Senha -->
                <div class="mt-2" id="senha-criterios">
                    <small class="text-muted d-block">
                        <i class="fas fa-info-circle me-1"></i>A senha deve conter:
                    </small>
                    <div class="row mt-1">
                        <div class="col-6">
                            <small>
                                <span id="criterio-length" class="text-danger">
                                    <i class="far fa-circle me-1"></i>Mínimo 8 caracteres
                                </span>
                            </small>
                        </div>
                        <div class="col-6">
                            <small>
                                <span id="criterio-uppercase" class="text-danger">
                                    <i class="far fa-circle me-1"></i>1 letra maiúscula
                                </span>
                            </small>
                        </div>
                        <div class="col-6">
                            <small>
                                <span id="criterio-lowercase" class="text-danger">
                                    <i class="far fa-circle me-1"></i>1 letra minúscula
                                </span>
                            </small>
                        </div>
                        <div class="col-6">
                            <small>
                                <span id="criterio-number" class="text-danger">
                                    <i class="far fa-circle me-1"></i>1 número
                                </span>
                            </small>
                        </div>
                        <div class="col-6">
                            <small>
                                <span id="criterio-special" class="text-danger">
                                    <i class="far fa-circle me-1"></i>1 caractere especial
                                </span>
                            </small>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Confirmar Nova Senha -->
            <div class="mb-4">
                <label for="confirmar-senha" class="form-label">
                    <i class="fas fa-lock me-1"></i>Confirmar Nova Senha
                </label>
                <div class="input-group">
                    <input type="password" 
                           class="form-control" 
                           id="confirmar-senha" 
                           required
                           placeholder="Digite novamente a nova senha">
                    <button class="btn btn-outline-secondary" type="button" id="toggle-confirmar-senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                <div id="senha-match" class="form-text">
                    <!-- Mensagem de confirmação aparecerá aqui -->
                </div>
            </div>
            
            <!-- Botões -->
            <div class="d-flex justify-content-between">
                <button type="button" class="btn btn-outline-secondary" id="btn-cancelar-senha">
                    <i class="fas fa-times me-1"></i>Cancelar
                </button>
                <button type="submit" class="btn btn-primary" id="btn-alterar-senha" disabled>
                    <i class="fas fa-save me-1"></i>Alterar Senha
                </button>
            </div>
            
            <!-- Mensagens de erro/sucesso -->
            <div id="senha-mensagens" class="mt-3"></div>
        </form>
    `;
    
    // Inicializar validação de senha
    setupSenhaValidation();
    setupFormListeners();
}

// Função para validar força da senha
function validatePasswordStrength(password) {
    const criterios = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /\d/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
    
    // Contar critérios atendidos
    const criteriosAtendidos = Object.values(criterios).filter(Boolean).length;
    
    // Determinar força
    let strength = 0;
    let strengthText = '';
    let strengthColor = '';
    
    if (criteriosAtendidos <= 2) {
        strength = 25;
        strengthText = 'Muito fraca';
        strengthColor = '#dc3545'; // Vermelho
    } else if (criteriosAtendidos === 3) {
        strength = 50;
        strengthText = 'Fraca';
        strengthColor = '#fd7e14'; // Laranja
    } else if (criteriosAtendidos === 4) {
        strength = 75;
        strengthText = 'Boa';
        strengthColor = '#ffc107'; // Amarelo
    } else {
        strength = 100;
        strengthText = 'Forte';
        strengthColor = '#28a745'; // Verde
    }
    
    // Atualizar interface dos critérios
    Object.keys(criterios).forEach(key => {
        const elemento = document.getElementById(`criterio-${key}`);
        if (elemento) {
            if (criterios[key]) {
                elemento.className = 'text-success';
                elemento.innerHTML = '<i class="fas fa-check-circle me-1"></i>' + 
                    elemento.textContent.replace('●', '').replace('○', '').trim();
            } else {
                elemento.className = 'text-danger';
                elemento.innerHTML = '<i class="far fa-circle me-1"></i>' + 
                    elemento.textContent.replace('●', '').replace('○', '').trim();
            }
        }
    });
    
    return { strength, strengthText, strengthColor, criterios, criteriosAtendidos };
}

// Configurar validação da senha
function setupSenhaValidation() {
    const novaSenhaInput = document.getElementById('nova-senha');
    const confirmarSenhaInput = document.getElementById('confirmar-senha');
    const btnAlterar = document.getElementById('btn-alterar-senha');
    const barraForca = document.getElementById('senha-strength-bar');
    const textoForca = document.getElementById('senha-strength-text');
    const textoMatch = document.getElementById('senha-match');
    const mensagensDiv = document.getElementById('senha-mensagens');
    
    if (!novaSenhaInput) return;
    
    // Validar enquanto digita
    novaSenhaInput.addEventListener('input', function() {
        const senha = this.value;
        const resultado = validatePasswordStrength(senha);
        
        // Atualizar barra de força
        if (barraForca) {
            barraForca.style.width = `${resultado.strength}%`;
            barraForca.style.backgroundColor = resultado.strengthColor;
        }
        
        // Atualizar texto
        if (textoForca) {
            textoForca.textContent = `Força da senha: ${resultado.strengthText}`;
            textoForca.style.color = resultado.strengthColor;
        }
        
        // Atualizar critérios
        if (resultado.criteriosAtendidos === 5) {
            if (textoMatch) {
                textoMatch.textContent = '✅ Todos os critérios atendidos';
                textoMatch.className = 'form-text text-success';
            }
        } else {
            if (textoMatch) {
                textoMatch.textContent = '❌ Ainda faltam critérios';
                textoMatch.className = 'form-text text-danger';
            }
        }
        
        // Verificar se senhas coincidem
        checkSenhasCoincidem();
    });
    
    // Verificar se senhas coincidem
    function checkSenhasCoincidem() {
        const senha = novaSenhaInput.value;
        const confirmacao = confirmarSenhaInput ? confirmarSenhaInput.value : '';
        
        if (confirmacao === '') {
            if (textoMatch) {
                textoMatch.textContent = 'Digite a confirmação da senha';
                textoMatch.className = 'form-text text-muted';
            }
            if (btnAlterar) btnAlterar.disabled = true;
            return false;
        }
        
        if (senha === confirmacao) {
            if (textoMatch) {
                textoMatch.innerHTML = '✅ As senhas coincidem';
                textoMatch.className = 'form-text text-success';
            }
            
            // Só habilitar botão se todos os critérios forem atendidos
            const resultado = validatePasswordStrength(senha);
            if (btnAlterar) {
                btnAlterar.disabled = resultado.criteriosAtendidos < 5;
            }
            return true;
        } else {
            if (textoMatch) {
                textoMatch.innerHTML = '❌ As senhas não coincidem';
                textoMatch.className = 'form-text text-danger';
            }
            if (btnAlterar) btnAlterar.disabled = true;
            return false;
        }
    }
    
    // Validar também na confirmação
    if (confirmarSenhaInput) {
        confirmarSenhaInput.addEventListener('input', checkSenhasCoincidem);
    }
    
    // Alternar visibilidade das senhas
    setupTogglePasswordVisibility();
}

// Configurar toggle de visibilidade das senhas
function setupTogglePasswordVisibility() {
    ['senha-atual', 'nova-senha', 'confirmar-senha'].forEach(id => {
        const toggleBtn = document.getElementById(`toggle-${id}`);
        const input = document.getElementById(id);
        
        if (toggleBtn && input) {
            toggleBtn.addEventListener('click', function() {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                
                // Alterar ícone
                const icon = this.querySelector('i');
                if (icon) {
                    icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
                }
            });
        }
    });
}

// Configurar listeners do formulário
function setupFormListeners() {
    const form = document.getElementById('form-alterar-senha');
    const btnCancelar = document.getElementById('btn-cancelar-senha');
    
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            await alterarSenha();
        });
    }
    
    if (btnCancelar) {
        btnCancelar.addEventListener('click', function() {
            // Voltar para visualização padrão
            const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
            if (conteudoDinamico) {
                conteudoDinamico.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-user-circle text-muted" style="font-size: 64px;"></i>
                        <h4 class="mt-3">Selecione uma opção</h4>
                        <p class="text-muted">Clique em "Alterar Senha" para começar</p>
                    </div>
                `;
            }
        });
    }
}

// Função para alterar senha
async function alterarSenha() {
    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('nova-senha').value;
    const confirmarSenha = document.getElementById('confirmar-senha').value;
    const btnAlterar = document.getElementById('btn-alterar-senha');
    const mensagensDiv = document.getElementById('senha-mensagens');
    
    // Validar
    if (!senhaAtual || !novaSenha || !confirmarSenha) {
        showMessage('Por favor, preencha todos os campos.', 'danger', mensagensDiv);
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        showMessage('As senhas não coincidem.', 'danger', mensagensDiv);
        return;
    }
    
    // Validar força da senha
    const resultado = validatePasswordStrength(novaSenha);
    if (resultado.criteriosAtendidos < 5) {
        showMessage('A nova senha não atende a todos os critérios de segurança.', 'danger', mensagensDiv);
        return;
    }
    
    try {
        // Desabilitar botão e mostrar loading
        if (btnAlterar) {
            btnAlterar.disabled = true;
            btnAlterar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Alterando...';
        }
        
        // Reautenticar usuário
        const user = auth.currentUser;
        if (!user || !user.email) {
            throw new Error('Usuário não autenticado');
        }
        
        const credential = EmailAuthProvider.credential(user.email, senhaAtual);
        await reauthenticateWithCredential(user, credential);
        
        // Atualizar senha
        await updatePassword(user, novaSenha);
        
        // Sucesso
        showMessage('✅ Senha alterada com sucesso!', 'success', mensagensDiv);
        
        // Limpar formulário
        document.getElementById('form-alterar-senha').reset();
        
        // Resetar validação
        const barraForca = document.getElementById('senha-strength-bar');
        const textoForca = document.getElementById('senha-strength-text');
        
        if (barraForca) barraForca.style.width = '0%';
        if (textoForca) {
            textoForca.textContent = 'Força da senha: Muito fraca';
            textoForca.style.color = '';
        }
        
        // Resetar critérios
        ['length', 'uppercase', 'lowercase', 'number', 'special'].forEach(key => {
            const elemento = document.getElementById(`criterio-${key}`);
            if (elemento) {
                elemento.className = 'text-danger';
                elemento.innerHTML = '<i class="far fa-circle me-1"></i>' + 
                    elemento.textContent.replace('●', '').replace('○', '').replace('✅', '').replace('❌', '').trim();
            }
        });
        
        // Desabilitar botão novamente
        if (btnAlterar) {
            btnAlterar.disabled = true;
            btnAlterar.innerHTML = '<i class="fas fa-save me-1"></i>Alterar Senha';
        }
        
        // Atualizar mensagem de confirmação
        const textoMatch = document.getElementById('senha-match');
        if (textoMatch) {
            textoMatch.textContent = '';
        }
        
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        // Firebase: Error (auth/invalid-login-credentials).
        let errorMessage = 'Erro ao alterar senha. ';
        switch (error.code) {
            case 'auth/invalid-login-credentials':
                errorMessage += 'Senha atual incorreta.';
                break;
            case 'auth/weak-password':
                errorMessage += 'A nova senha é muito fraca.';
                break;
            case 'auth/requires-recent-login':
                errorMessage += 'Sessão expirada. Por favor, faça login novamente.';
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
                break;
            default:
                errorMessage += error.message;
        }
        
        showMessage(errorMessage, 'danger', mensagensDiv);
        
        // Reabilitar botão
        if (btnAlterar) {
            btnAlterar.disabled = false;
            btnAlterar.innerHTML = '<i class="fas fa-save me-1"></i>Alterar Senha';
        }
    }
}

// Função auxiliar para mostrar mensagens
function showMessage(message, type, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Auto-remover após 5 segundos (exceto para sucesso)
    if (type !== 'success') {
        setTimeout(() => {
            const alert = container.querySelector('.alert');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Usar event delegation para links dinâmicos
    document.addEventListener('click', function(e) {
        // Link "Alterar Senha"
        if (e.target.closest('#link-alterar-senha')) {
            e.preventDefault();
            showAlterarSenhaForm();
            
            // Ativar visualmente o link
            document.querySelectorAll('.list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            e.target.closest('#link-alterar-senha').classList.add('active');
        }
    });
}

// Função para mostrar erro
function showPerfilError(error) {
    const perfilContent = document.querySelector('#perfil-content') || 
                         document.querySelector('.card-body');
    
    if (perfilContent) {
        perfilContent.innerHTML = `
            <div class="alert alert-danger">
                <h4>Erro no Perfil</h4>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="location.reload()">
                    <i class="fas fa-redo me-1"></i>Tentar Novamente
                </button>
            </div>
        `;
    }
}

// Se estiver carregando como página normal (não SPA)
if (!window.location.pathname.includes('app.html') && 
    !document.getElementById('app-content')) {
    
    console.log('🌐 Perfil carregando como página normal...');
    document.addEventListener('DOMContentLoaded', async function() {
        // Carrega navbar primeiro
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        
        await initPerfil();
    });
}

// Exportar função para SPA
export default initPerfil;