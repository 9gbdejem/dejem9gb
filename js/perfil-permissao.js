// js/perfil-permissao.js - Sistema de Permissões (Somente Admin - Nível 1)
import { auth } from './firebase-config.js';
import { ref, get, set, update, push } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { database } from './firebase-config.js';

// Cache de dados
let opmsDisponiveis = {};
let usuarioAtual = null;
let reAtual = null;

// Exportar funções para SPA
export async function initPermissoesSPA() {
    console.log('🚀 Permissões inicializando (SPA)...');
    await initPermissoes();
}

export async function initPermissoes() {
    try {
        // 1. VERIFICAÇÃO DE NÍVEL - BUSCAR PELO RE DO USUÁRIO ATUAL
        const userRE = sessionStorage.getItem('userRE');
        if (!userRE) throw new Error('Usuário não autenticado');
        
        // Buscar dados do usuário atual pelo RE (nova estrutura)
        const userRef = ref(database, `efetivo/${userRE}`);
        const userSnap = await get(userRef);
        
        if (!userSnap.exists()) {
            // Se não encontrar, buscar pela estrutura antiga (compatibilidade)
            console.warn('⚠️ Usuário não encontrado pela nova estrutura, tentando buscar todos...');
            
            // Buscar em todos os usuários para encontrar pelo RE
            const allUsersRef = ref(database, 'efetivo');
            const allSnapshot = await get(allUsersRef);
            
            let usuarioEncontrado = null;
            let usuarioKey = null;
            
            if (allSnapshot.exists()) {
                allSnapshot.forEach((childSnapshot) => {
                    const usuario = childSnapshot.val();
                    if (usuario.re === userRE) {
                        usuarioEncontrado = usuario;
                        usuarioKey = childSnapshot.key;
                    }
                });
            }
            
            if (!usuarioEncontrado) {
                throw new Error('Usuário não encontrado no banco');
            }
            
            // Usar dados encontrados
            const nivelUsuario = usuarioEncontrado.nivel || 0;
            
            // Somente nível 1 (admin) pode acessar
            if (nivelUsuario !== 1) {
                throw new Error('Acesso restrito a administradores');
            }
            
        } else {
            // Usuário encontrado na nova estrutura
            const userData = userSnap.val();
            const nivelUsuario = userData.nivel || 0;
            
            // Somente nível 1 (admin) pode acessar
            if (nivelUsuario !== 1) {
                throw new Error('Acesso restrito a administradores');
            }
        }
        
        // 2. Carregar OPMs disponíveis
        await carregarOPMs();
        
        // 3. Renderizar interface
        renderizarInterfacePermissoes();
        
        // 4. Configurar listeners
        setupPermissoesListeners();
        
        console.log('✅ Sistema de permissões carregado');
        
    } catch (error) {
        console.error('❌ Erro nas permissões:', error);
        showPermissoesError(error);
    }
}

// Carregar lista de OPMs do nó 'local'
async function carregarOPMs() {
    try {
        const opmRef = ref(database, 'local');
        const snapshot = await get(opmRef);
        
        opmsDisponiveis = {};
        
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const codigo = childSnapshot.key;
                const nome = childSnapshot.val();
                
                // Verificar se código tem 9 dígitos
                if (codigo && codigo.toString().length === 9) {
                    opmsDisponiveis[codigo] = nome;
                }
            });
            
            console.log(`✅ ${Object.keys(opmsDisponiveis).length} OPMs carregadas`);
        } else {
            console.warn('⚠️ Nenhuma OPM encontrada no banco');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar OPMs:', error);
        opmsDisponiveis = {};
    }
}

// Renderizar interface principal
function renderizarInterfacePermissoes() {
    const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
    if (!conteudoDinamico) {
        console.error('Elemento #perfil-conteudo-dinamico não encontrado');
        return;
    }
    
    conteudoDinamico.innerHTML = `
        <h4 class="mb-4">
            <i class="fas fa-user-shield me-2"></i>Gerenciar Permissões
        </h4>
        
        <!-- Pesquisa por RE -->
        <div class="card mb-4">
            <div class="card-body">
                <h5 class="card-title mb-3">
                    <i class="fas fa-search me-2"></i>Pesquisar Militar
                </h5>
                
                <div class="row g-3">
                    <div class="col-md-8">
                        <label for="input-pesquisa-re" class="form-label">
                            <i class="fas fa-id-card me-1"></i>Registro de Emergência (RE)
                        </label>
                        <input type="text" 
                               class="form-control" 
                               id="input-pesquisa-re"
                               placeholder="Digite o RE (6 dígitos)"
                               maxlength="6"
                               pattern="[0-9]{6}">
                        <div class="form-text">Digite o RE de 6 dígitos do militar</div>
                    </div>
                    
                    <div class="col-md-4 d-flex align-items-end">
                        <button class="btn btn-primary w-100" id="btn-pesquisar-re">
                            <i class="fas fa-search me-1"></i>Pesquisar
                        </button>
                    </div>
                </div>
                
                <!-- Status da pesquisa -->
                <div id="pesquisa-status" class="mt-3"></div>
            </div>
        </div>
        
        <!-- Formulário de Dados (inicialmente oculto) -->
        <div class="card" id="card-dados-usuario" style="display: none;">
            <div class="card-body">
                <h5 class="card-title mb-4">
                    <i class="fas fa-user-edit me-2"></i>Dados do Militar
                    <span class="badge bg-info ms-2" id="badge-novo-usuario" style="display: none;">Novo Usuário</span>
                </h5>
                
                <form id="form-permissoes">
                    <!-- RE (não editável, apenas para referência) -->
                    <div class="mb-3">
                        <label class="form-label">
                            <i class="fas fa-id-card me-1"></i>RE
                        </label>
                        <input type="text" 
                               class="form-control bg-light" 
                               id="input-re"
                               readonly>
                    </div>
                    
                    <!-- Nome -->
                    <div class="mb-3">
                        <label for="input-nome" class="form-label">
                            <i class="fas fa-user me-1"></i>Nome Completo
                        </label>
                        <input type="text" 
                               class="form-control" 
                               id="input-nome"
                               placeholder="Digite o nome completo">
                        <div class="form-text text-danger" id="nome-erro" style="display: none;">
                            Nome é obrigatório
                        </div>
                    </div>
                    
                    <!-- Email -->
                    <div class="mb-3">
                        <label for="input-email" class="form-label">
                            <i class="fas fa-envelope me-1"></i>E-mail
                        </label>
                        <input type="email" 
                               class="form-control" 
                               id="input-email"
                               placeholder="exemplo@pm.sp.gov.br">
                        <div class="form-text">Usado para login no sistema</div>
                        <div class="form-text text-danger" id="email-erro" style="display: none;">
                            E-mail é obrigatório e deve ser válido
                        </div>
                    </div>
                    
                    <!-- Nível -->
                    <div class="mb-4">
                        <label for="select-nivel" class="form-label">
                            <i class="fas fa-shield-alt me-1"></i>Nível de Acesso
                        </label>
                        <select class="form-select" id="select-nivel">
                            <option value="3">3 - Usuário (Padrão)</option>
                            <option value="2">2 - Moderador</option>
                            <option value="1">1 - Administrador</option>
                        </select>
                        <div class="form-text">
                            <strong>Nível 1:</strong> Acesso total (admin) |
                            <strong>Nível 2:</strong> Pode aprovar solicitações |
                            <strong>Nível 3:</strong> Pode apenas solicitar
                        </div>
                    </div>
                    
                    <!-- Permissões de OPM -->
                    <div class="mb-4">
                        <label class="form-label mb-3">
                            <i class="fas fa-building me-1"></i>OPMs Permitidas
                            <span class="badge bg-secondary ms-1" id="contador-opm">0 selecionadas</span>
                        </label>
                        
                        <div id="container-opms" class="opms-container">
                            ${Object.keys(opmsDisponiveis).length === 0 
                                ? '<div class="alert alert-warning">Nenhuma OPM cadastrada no sistema</div>' 
                                : gerarCheckboxesOPMs()}
                        </div>
                        
                        <!-- Controles rápidos -->
                        ${Object.keys(opmsDisponiveis).length > 0 ? `
                        <div class="mt-3">
                            <button type="button" class="btn btn-sm btn-outline-secondary me-2" id="btn-selecionar-todas">
                                <i class="fas fa-check-square me-1"></i>Selecionar Todas
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-limpar-selecao">
                                <i class="fas fa-times-circle me-1"></i>Limpar Seleção
                            </button>
                        </div>
                        ` : ''}
                        
                        <div class="form-text mt-2">
                            <i class="fas fa-info-circle me-1"></i>
                            O militar só poderá solicitar vagas nas OPMs selecionadas
                        </div>
                    </div>
                    
                    <!-- Botões de ação -->
                    <div class="d-flex justify-content-between pt-3 border-top">
                        <button type="button" class="btn btn-outline-secondary" id="btn-cancelar-permissoes">
                            <i class="fas fa-times me-1"></i>Cancelar
                        </button>
                        
                        <div>
                            <button type="button" class="btn btn-danger me-2" id="btn-excluir-usuario" style="display: none;">
                                <i class="fas fa-trash me-1"></i>Excluir
                            </button>
                            
                            <button type="submit" class="btn btn-primary" id="btn-salvar-permissoes">
                                <i class="fas fa-save me-1"></i>Salvar Alterações
                            </button>
                        </div>
                    </div>
                    
                    <!-- Mensagens de status -->
                    <div id="permissoes-mensagens" class="mt-4"></div>
                </form>
            </div>
        </div>
    `;
    
    // Aplicar estilos CSS
    aplicarEstilosPermissoes();
}

// Gerar checkboxes das OPMs
function gerarCheckboxesOPMs() {
    let html = '<div class="row g-2">';
    
    Object.entries(opmsDisponiveis).forEach(([codigo, nome]) => {
        html += `
            <div class="col-md-6 col-lg-4">
                <div class="form-check opm-checkbox">
                    <input class="form-check-input" 
                           type="checkbox" 
                           value="${codigo}" 
                           id="opm-${codigo}"
                           data-codigo="${codigo}"
                           data-nome="${nome}">
                    <label class="form-check-label" for="opm-${codigo}">
                        <span class="opm-codigo badge bg-secondary me-2">${codigo}</span>
                        <span class="opm-nome">${nome}</span>
                    </label>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// Aplicar estilos CSS dinamicamente
function aplicarEstilosPermissoes() {
    const styleId = 'permissoes-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .opms-container {
                max-height: 300px;
                overflow-y: auto;
                padding: 15px;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                background-color: #f8f9fa;
            }
            
            .opm-checkbox {
                padding: 10px;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                margin-bottom: 5px;
                background-color: white;
                transition: all 0.2s;
            }
            
            .opm-checkbox:hover {
                border-color: #0d6efd;
                background-color: rgba(13, 110, 253, 0.05);
            }
            
            .opm-checkbox .form-check-input:checked ~ .form-check-label {
                font-weight: bold;
                color: #0d6efd;
            }
            
            .opm-codigo {
                font-family: monospace;
                font-size: 0.8em;
                min-width: 85px;
                display: inline-block;
                text-align: center;
            }
            
            .campo-modificado {
                border: 2px solid #ffc107 !important;
                box-shadow: 0 0 0 0.2rem rgba(255, 193, 7, 0.25);
            }
            
            #contador-opm {
                font-size: 0.8em;
                vertical-align: middle;
            }
            
            /* Scrollbar personalizada */
            .opms-container::-webkit-scrollbar {
                width: 8px;
            }
            
            .opms-container::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }
            
            .opms-container::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
            }
            
            .opms-container::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
    }
}

// Configurar listeners
function setupPermissoesListeners() {
    // Pesquisar RE
    const btnPesquisar = document.getElementById('btn-pesquisar-re');
    const inputPesquisa = document.getElementById('input-pesquisa-re');
    
    if (btnPesquisar) {
        btnPesquisar.addEventListener('click', pesquisarMilitar);
    }
    
    if (inputPesquisa) {
        inputPesquisa.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                pesquisarMilitar();
            }
        });
    }
    
    // Controles de seleção OPM
    const btnSelecionarTodas = document.getElementById('btn-selecionar-todas');
    const btnLimparSelecao = document.getElementById('btn-limpar-selecao');
    
    if (btnSelecionarTodas) {
        btnSelecionarTodas.addEventListener('click', () => {
            document.querySelectorAll('.opm-checkbox input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }
    
    if (btnLimparSelecao) {
        btnLimparSelecao.addEventListener('click', () => {
            document.querySelectorAll('.opm-checkbox input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            });
        });
    }
    
    // Cancelar
    const btnCancelar = document.getElementById('btn-cancelar-permissoes');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            limparFormulario();
            document.getElementById('card-dados-usuario').style.display = 'none';
            document.getElementById('pesquisa-status').innerHTML = '';
        });
    }
    
    // Excluir usuário
    const btnExcluir = document.getElementById('btn-excluir-usuario');
    if (btnExcluir) {
        btnExcluir.addEventListener('click', excluirUsuario);
    }
    
    // Salvar
    const form = document.getElementById('form-permissoes');
    if (form) {
        form.addEventListener('submit', salvarPermissoes);
    }
    
    // Detectar modificações nos campos (borda destacada)
    setupDetectModificacoes();
    
    // Atualizar contador de OPMs
    setupContadorOPMs();
}

// Pesquisar militar pelo RE - NOVA VERSÃO PARA ESTRUTURA CORRETA
async function pesquisarMilitar() {
    const input = document.getElementById('input-pesquisa-re');
    const statusDiv = document.getElementById('pesquisa-status');
    const btnPesquisar = document.getElementById('btn-pesquisar-re');
    
    if (!input || !input.value.trim()) {
        mostrarMensagemStatus('⚠️ Digite um RE para pesquisar', 'warning', statusDiv);
        return;
    }
    
    const re = input.value.trim().padStart(6, '0');
    
    if (re.length !== 6 || !/^\d{6}$/.test(re)) {
        mostrarMensagemStatus('❌ RE deve conter exatamente 6 dígitos', 'danger', statusDiv);
        return;
    }
    
    try {
        // Desabilitar botão durante pesquisa
        if (btnPesquisar) {
            btnPesquisar.disabled = true;
            btnPesquisar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Pesquisando...';
        }
        
        // Mostrar status de carregamento
        mostrarMensagemStatus('<i class="fas fa-spinner fa-spin me-1"></i> Pesquisando...', 'info', statusDiv);
        
        // BUSCAR DIRETAMENTE PELO RE (nova estrutura)
        const usuarioRef = ref(database, `efetivo/${re}`);
        const snapshot = await get(usuarioRef);
        
        // Processar resultado
        if (snapshot.exists()) {
            // Usuário encontrado
            usuarioAtual = snapshot.val();
            reAtual = re;
            
            mostrarMensagemStatus(
                `✅ Militar encontrado: ${usuarioAtual.nome || 'Sem nome'}`,
                'success',
                statusDiv
            );
            
            // Preencher formulário
            preencherFormulario(usuarioAtual, re);
            
            // Mostrar card de dados
            document.getElementById('card-dados-usuario').style.display = 'block';
            
            // Mostrar botão excluir
            document.getElementById('btn-excluir-usuario').style.display = 'inline-block';
            
            // Ocultar badge "novo usuário"
            document.getElementById('badge-novo-usuario').style.display = 'none';
            
        } else {
            // Usuário não encontrado - modo cadastro
            mostrarMensagemStatus(
                `⚠️ RE ${re} não encontrado. Você pode cadastrar um novo militar.`,
                'warning',
                statusDiv
            );
            
            // Limpar dados anteriores
            usuarioAtual = null;
            reAtual = re;
            
            // Preencher apenas o RE
            preencherFormulario({}, re);
            
            // Mostrar card de dados
            document.getElementById('card-dados-usuario').style.display = 'block';
            
            // Mostrar badge "novo usuário"
            document.getElementById('badge-novo-usuario').style.display = 'inline-block';
            
            // Ocultar botão excluir
            document.getElementById('btn-excluir-usuario').style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Erro na pesquisa:', error);
        mostrarMensagemStatus(
            `❌ Erro na pesquisa: ${error.message}`,
            'danger',
            statusDiv
        );
    } finally {
        // Reabilitar botão
        if (btnPesquisar) {
            btnPesquisar.disabled = false;
            btnPesquisar.innerHTML = '<i class="fas fa-search me-1"></i>Pesquisar';
        }
    }
}

// Preencher formulário com dados
function preencherFormulario(usuario, re) {
    // RE (não editável)
    const inputRE = document.getElementById('input-re');
    if (inputRE) inputRE.value = re;
    
    // Nome
    const inputNome = document.getElementById('input-nome');
    if (inputNome) {
        inputNome.value = usuario.nome || '';
        inputNome.dataset.original = usuario.nome || '';
    }
    
    // Email
    const inputEmail = document.getElementById('input-email');
    if (inputEmail) {
        inputEmail.value = usuario.email || '';
        inputEmail.dataset.original = usuario.email || '';
    }
    
    // Nível
    const selectNivel = document.getElementById('select-nivel');
    if (selectNivel) {
        selectNivel.value = usuario.nivel || 3;
        selectNivel.dataset.original = usuario.nivel || 3;
    }
    
    // Permissões OPM
    const permissoes = usuario.permissaoOPM || {};
    
    document.querySelectorAll('.opm-checkbox input[type="checkbox"]').forEach(cb => {
        const codigo = cb.value;
        cb.checked = permissoes[codigo] === true;
        cb.dataset.original = permissoes[codigo] === true;
    });
    
    // Atualizar contador
    atualizarContadorOPMs();
    
    // Resetar bordas modificadas
    document.querySelectorAll('.campo-modificado').forEach(el => {
        el.classList.remove('campo-modificado');
    });
}

// Configurar detecção de modificações
function setupDetectModificacoes() {
    // Detectar mudanças nos campos de texto/seleção
    document.addEventListener('input', function(e) {
        const target = e.target;
        
        if (target.matches('#input-nome, #input-email, #select-nivel')) {
            const original = target.dataset.original || '';
            const atual = target.value;
            
            if (atual !== original) {
                target.classList.add('campo-modificado');
            } else {
                target.classList.remove('campo-modificado');
            }
        }
    });
    
    // Detectar mudanças nos checkboxes
    document.addEventListener('change', function(e) {
        if (e.target.matches('.opm-checkbox input[type="checkbox"]')) {
            const original = e.target.dataset.original === 'true';
            const atual = e.target.checked;
            
            if (atual !== original) {
                e.target.parentElement.classList.add('campo-modificado');
            } else {
                e.target.parentElement.classList.remove('campo-modificado');
            }
            
            atualizarContadorOPMs();
        }
    });
}

// Configurar contador de OPMs
function setupContadorOPMs() {
    atualizarContadorOPMs();
}

function atualizarContadorOPMs() {
    const contador = document.getElementById('contador-opm');
    if (!contador) return;
    
    const selecionadas = document.querySelectorAll('.opm-checkbox input[type="checkbox"]:checked').length;
    const total = document.querySelectorAll('.opm-checkbox input[type="checkbox"]').length;
    
    contador.textContent = `${selecionadas}/${total} selecionadas`;
    
    // Mudar cor baseado na quantidade
    if (selecionadas === 0) {
        contador.className = 'badge bg-danger ms-1';
    } else if (selecionadas === total) {
        contador.className = 'badge bg-success ms-1';
    } else {
        contador.className = 'badge bg-warning ms-1';
    }
}

// Salvar permissões - VERSÃO CORRIGIDA PARA NOVA ESTRUTURA
async function salvarPermissoes(e) {
    e.preventDefault();
    
    const form = document.getElementById('form-permissoes');
    const btnSalvar = document.getElementById('btn-salvar-permissoes');
    const mensagensDiv = document.getElementById('permissoes-mensagens');
    
    // Coletar dados
    const re = document.getElementById('input-re').value;
    const nome = document.getElementById('input-nome').value.trim();
    const email = document.getElementById('input-email').value.trim();
    const nivel = parseInt(document.getElementById('select-nivel').value);
    
    // Validações
    if (!re || re.length !== 6) {
        mostrarMensagem('RE inválido', 'danger', mensagensDiv);
        return;
    }
    
    if (!nome) {
        mostrarMensagem('Nome é obrigatório', 'danger', mensagensDiv);
        document.getElementById('nome-erro').style.display = 'block';
        return;
    }
    
    if (!email || !isValidEmail(email)) {
        mostrarMensagem('E-mail é obrigatório e deve ser válido', 'danger', mensagensDiv);
        document.getElementById('email-erro').style.display = 'block';
        return;
    }
    
    // Coletar OPMs selecionadas
    const permissoesOPM = {};
    document.querySelectorAll('.opm-checkbox input[type="checkbox"]:checked').forEach(cb => {
        permissoesOPM[cb.value] = true;
    });
    
    try {
        // Desabilitar botão
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando...';
        }
        
        // MOSTRAR STATUS
        mostrarMensagem('<i class="fas fa-spinner fa-spin me-1"></i> Salvando alterações...', 'info', mensagensDiv);
        
        // 1. VERIFICAR SE O EMAIL FOI ALTERADO
        // Buscar dados atuais para comparar
        const userRef = ref(database, `efetivo/${re}`);
        const existingUser = await get(userRef);
        
        let emailAntigo = null;
        if (existingUser.exists()) {
            emailAntigo = existingUser.val().email;
        }
        
        const emailAlterado = (emailAntigo && emailAntigo !== email);
        
        // 2. PREPARAR DADOS DO USUÁRIO PARA EFETIVO
        const userData = {
            nome: nome,
            email: email,
            nivel: nivel,
            permissaoOPM: permissoesOPM,
            atualizado_em: new Date().toISOString(),
            re: re
        };
        
        // Adicionar criado_em se for novo usuário
        if (!existingUser.exists()) {
            userData.criado_em = new Date().toISOString();
        }
        
        // 3. SALVAR NO NÓ EFETIVO
        await set(userRef, userData);
        console.log(`✅ Dados salvos em efetivo/${re}`);
        
        // 4. SE EMAIL FOI ALTERADO, ATUALIZAR TAMBÉM NO NÓ LOGIN
        if (emailAlterado) {
            console.log(`📧 Email alterado de "${emailAntigo}" para "${email}". Atualizando login...`);
            
            try {
                // Atualizar no nó login/RE/email
                const loginRef = ref(database, `login/${re}`);
                const loginSnapshot = await get(loginRef);
                
                if (loginSnapshot.exists()) {
                    // Se já existe, atualizar apenas o email
                    await update(loginRef, {
                        email: email,
                        atualizado_em: new Date().toISOString()
                    });
                    console.log(`✅ Login atualizado em login/${re}`);
                } else {
                    // Se não existe, criar o nó login
                    await set(loginRef, {
                        email: email,
                        re: re,
                        criado_em: new Date().toISOString(),
                        atualizado_em: new Date().toISOString()
                    });
                    console.log(`✅ Login criado em login/${re}`);
                }
                
                mostrarMensagem('✅ Dados salvos e e-mail sincronizado com o login!', 'success', mensagensDiv);
                
            } catch (loginError) {
                console.error('❌ Erro ao atualizar login:', loginError);
                // Não falhar a operação principal, apenas avisar
                mostrarMensagem(
                    '⚠️ Dados salvos, mas houve erro ao sincronizar e-mail no login. Entre em contato com o suporte.',
                    'warning',
                    mensagensDiv
                );
            }
        } else {
            // Email não foi alterado
            if (!existingUser.exists()) {
                mostrarMensagem('✅ Novo militar cadastrado com sucesso!', 'success', mensagensDiv);
                
                // Para novo usuário, também criar no login se não existir
                try {
                    const loginRef = ref(database, `login/${re}`);
                    const loginSnapshot = await get(loginRef);
                    
                    if (!loginSnapshot.exists()) {
                        await set(loginRef, {
                            email: email,
                            re: re,
                            criado_em: new Date().toISOString(),
                            atualizado_em: new Date().toISOString()
                        });
                        console.log(`✅ Login criado para novo usuário em login/${re}`);
                    }
                } catch (loginError) {
                    console.warn('⚠️ Não foi possível criar login para novo usuário:', loginError);
                }
            } else {
                mostrarMensagem('✅ Dados do militar atualizados com sucesso!', 'success', mensagensDiv);
            }
        }
        
        // 5. ATUALIZAR VALORES ORIGINAIS
        atualizarValoresOriginais();
        
        // 6. LIMPAR MARCAÇÕES DE MODIFICAÇÃO
        document.querySelectorAll('.campo-modificado').forEach(el => {
            el.classList.remove('campo-modificado');
        });
        
        // 7. OCULTAR BADGE E MOSTRAR BOTÃO EXCLUIR
        document.getElementById('badge-novo-usuario').style.display = 'none';
        document.getElementById('btn-excluir-usuario').style.display = 'inline-block';
        
        // 8. SE O USUÁRIO ALTEROU O PRÓPRIO EMAIL, ATUALIZAR SESSION STORAGE
        const userRE = sessionStorage.getItem('userRE');
        if (userRE === re && emailAlterado) {
            console.log('📝 Usuário alterou próprio email, atualizando sessionStorage');
            // Atualizar email na sessionStorage se existir
            // Nota: O email normalmente não fica na sessionStorage, mas se quiser adicionar:
            // sessionStorage.setItem('userEmail', email);
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        mostrarMensagem(`❌ Erro ao salvar: ${error.message}`, 'danger', mensagensDiv);
    } finally {
        // Reabilitar botão
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save me-1"></i>Salvar Alterações';
        }
    }
}

// Excluir usuário - VERSÃO CORRIGIDA
async function excluirUsuario() {
    if (!reAtual) {
        alert('Nenhum militar selecionado para excluir');
        return;
    }
    
    if (!confirm(`⚠️ Tem certeza que deseja excluir o militar RE ${reAtual}?\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    const btnExcluir = document.getElementById('btn-excluir-usuario');
    const mensagensDiv = document.getElementById('permissoes-mensagens');
    
    try {
        if (btnExcluir) {
            btnExcluir.disabled = true;
            btnExcluir.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Excluindo...';
        }
        
        const userRef = ref(database, `efetivo/${reAtual}`);
        await set(userRef, null); // Remove o nó
        
        mostrarMensagem('✅ Militar excluído com sucesso!', 'success', mensagensDiv);
        
        // Limpar formulário e ocultar
        limparFormulario();
        document.getElementById('card-dados-usuario').style.display = 'none';
        
        // Limpar status da pesquisa
        document.getElementById('pesquisa-status').innerHTML = '';
        document.getElementById('input-pesquisa-re').value = '';
        
        // Resetar variáveis
        usuarioAtual = null;
        reAtual = null;
        
    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        mostrarMensagem(`❌ Erro ao excluir: ${error.message}`, 'danger', mensagensDiv);
    } finally {
        if (btnExcluir) {
            btnExcluir.disabled = false;
            btnExcluir.innerHTML = '<i class="fas fa-trash me-1"></i>Excluir';
        }
    }
}

// Atualizar valores originais após salvar
function atualizarValoresOriginais() {
    // Nome
    const inputNome = document.getElementById('input-nome');
    if (inputNome) {
        inputNome.dataset.original = inputNome.value;
    }
    
    // Email
    const inputEmail = document.getElementById('input-email');
    if (inputEmail) {
        inputEmail.dataset.original = inputEmail.value;
    }
    
    // Nível
    const selectNivel = document.getElementById('select-nivel');
    if (selectNivel) {
        selectNivel.dataset.original = selectNivel.value;
    }
    
    // OPMs
    document.querySelectorAll('.opm-checkbox input[type="checkbox"]').forEach(cb => {
        cb.dataset.original = cb.checked;
    });
}

// Limpar formulário
function limparFormulario() {
    document.getElementById('input-re').value = '';
    document.getElementById('input-nome').value = '';
    document.getElementById('input-email').value = '';
    document.getElementById('select-nivel').value = '3';
    
    document.querySelectorAll('.opm-checkbox input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    atualizarContadorOPMs();
}

// Funções auxiliares
function mostrarMensagem(texto, tipo, container) {
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-${tipo} alert-dismissible fade show" role="alert">
            ${texto}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Auto-remover após 5 segundos (exceto para erros)
    setTimeout(() => {
        const alert = container.querySelector('.alert');
        if (alert && alert.classList.contains('alert-danger')) {
            alert.remove();
        }
    }, 5000);
}

function mostrarMensagemStatus(texto, tipo, container) {
    if (!container) return;
    
    const icon = tipo === 'success' ? 'fa-check-circle' :
                 tipo === 'warning' ? 'fa-exclamation-triangle' :
                 tipo === 'danger' ? 'fa-times-circle' :
                 'fa-info-circle';
    
    container.innerHTML = `
        <div class="alert alert-${tipo} d-flex align-items-center mb-0" role="alert">
            <i class="fas ${icon} me-2"></i>
            <div>${texto}</div>
        </div>
    `;
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showPermissoesError(error) {
    const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
    if (!conteudoDinamico) return;
    
    conteudoDinamico.innerHTML = `
        <div class="alert alert-danger">
            <h5><i class="fas fa-exclamation-triangle me-2"></i>Acesso Restrito</h5>
            <p>${error.message}</p>
            <div class="mt-3">
                <button class="btn btn-primary" onclick="window.app.loadPage('perfil.html')">
                    <i class="fas fa-arrow-left me-1"></i>Voltar ao Perfil
                </button>
            </div>
        </div>
    `;
}

// VERIFICAÇÃO DE SEGURANÇA ADICIONAL
document.addEventListener('DOMContentLoaded', function() {
    // Executar apenas se estiver na página de permissões
    if (document.getElementById('perfil-conteudo-dinamico') && 
        window.location.pathname.includes('app.html')) {
        
        // Verificar nível via sessionStorage
        const userLevel = sessionStorage.getItem('userLevel') || '3';
        if (userLevel !== '1') {
            const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
            if (conteudoDinamico) {
                conteudoDinamico.innerHTML = `
                    <div class="alert alert-danger">
                        <h5><i class="fas fa-ban me-2"></i>Acesso Negado</h5>
                        <p>Você não tem permissão para acessar esta funcionalidade.</p>
                        <div class="mt-3">
                            <button class="btn btn-primary" onclick="window.app.loadPage('perfil.html')">
                                <i class="fas fa-arrow-left me-1"></i>Voltar ao Perfil
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }
});

// Se carregando como página independente (não SPA)
if (!window.location.pathname.includes('app.html') && 
    !document.getElementById('app-content')) {
    
    console.log('🌐 Permissões carregando como página independente...');
    
    document.addEventListener('DOMContentLoaded', async function() {
        // Carregar navbar primeiro
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        
        // Verificar nível de acesso
        try {
            const userRE = sessionStorage.getItem('userRE');
            if (!userRE) throw new Error('Usuário não autenticado');
            
            // Buscar nível do usuário atual
            const userRef = ref(database, `efetivo/${userRE}`);
            const userSnap = await get(userRef);
            
            if (!userSnap.exists()) {
                throw new Error('Usuário não encontrado');
            }
            
            const userData = userSnap.val();
            if (userData.nivel !== 1) {
                throw new Error('Acesso restrito a administradores');
            }
            
            await initPermissoes();
            
        } catch (error) {
            console.error('❌ Acesso negado:', error);
            
            const conteudoDinamico = document.getElementById('perfil-conteudo-dinamico');
            if (conteudoDinamico) {
                conteudoDinamico.innerHTML = `
                    <div class="alert alert-danger">
                        <h5><i class="fas fa-ban me-2"></i>Acesso Negado</h5>
                        <p>Você não tem permissão para acessar esta funcionalidade.</p>
                        <p class="mb-0"><small>${error.message}</small></p>
                        <div class="mt-3">
                            <a href="perfil.html" class="btn btn-primary">
                                <i class="fas fa-arrow-left me-1"></i>Voltar ao Perfil
                            </a>
                        </div>
                    </div>
                `;
            }
        }
    });
}

export default initPermissoes;