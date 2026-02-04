// solicitacoes.js - Sistema de Solicitações Completo
import { checkAuth } from './auth-check.js';
import { auth, database } from './firebase-config.js';
import { 
    ref, get, set, update, push, child 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Configurações globais
let userDataCache = null;
let userRE = null;
let opmsPermitidas = [];
let opmsNomes = {};
let composicoesDisponiveis = {};
let solicitacoesCache = [];
let opmSelecionada = null;
let mesFiltro = null;
let anoFiltro = null;

// Google Drive API
let gapiInicializada = false;
let CLIENT_ID = 'SEU_CLIENT_ID_AQUI'; // Substituir
let API_KEY = 'SUA_API_KEY_AQUI'; // Substituir
let DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
let SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Exportar funções para SPA
export async function initSolicitacoesSPA() {
    console.log('🚀 Solicitações inicializando (SPA)...');
    await initSolicitacoes();
}

export async function initSolicitacoes() {
    try {
        // 1. Verificar autenticação - Nível 2+ apenas
        const { userData, re } = await checkAuth(2);
        userDataCache = userData;
        userRE = re;
        
        // 2. Garantir dados no sessionStorage
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        
        // 3. Atualizar userGreeting no SPA
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        // 4. Carregar dados necessários
        await carregarDadosIniciais();
        
        // 5. Inicializar Google Drive API EM SEGUNDO PLANO
        inicializarGoogleDrive().then(success => {
            console.log(success ? '✅ Drive OK' : '⚠️ Drive não disponível');
        });
        
        // 6. Renderizar interface IMEDIATAMENTE (não esperar pelo Drive)
        renderInterface();
        
        console.log('✅ Sistema de Solicitações carregado');
        
    } catch (error) {
        console.error('❌ Erro nas solicitações:', error);
        showSolicitacoesError(error);
    }
}

// Carregar dados iniciais do Firebase
async function carregarDadosIniciais() {
    try {
        // 1. Carregar OPMs permitidas para o usuário
        const permissaoRef = ref(database, `efetivo/${userRE}/permissaoOPM`);
        const permissaoSnapshot = await get(permissaoRef);
        
        if (permissaoSnapshot.exists()) {
            opmsPermitidas = Object.keys(permissaoSnapshot.val());
        }
        
        if (opmsPermitidas.length === 0) {
            throw new Error('Nenhuma OPM permitida para seu usuário');
        }
        
        // 2. Carregar nomes das OPMs
        const localRef = ref(database, 'local');
        const localSnapshot = await get(localRef);
        
        if (localSnapshot.exists()) {
            opmsNomes = localSnapshot.val();
        }
        
        // 3. Carregar composições das OPMs permitidas
        for (const opm of opmsPermitidas) {
            const opmRef = ref(database, `LocalOPM/${opm}`);
            const opmSnapshot = await get(opmRef);
            
            if (opmSnapshot.exists()) {
                composicoesDisponiveis[opm] = {};
                Object.entries(opmSnapshot.val()).forEach(([codigo, dados]) => {
                    composicoesDisponiveis[opm][codigo] = dados;
                });
            }
        }
        
        // 4. Definir mês e ano atual para filtro
        const hoje = new Date();
        mesFiltro = hoje.getMonth() + 1; // 1-12
        anoFiltro = hoje.getFullYear();
        
        // 5. Carregar solicitações do mês atual
        await carregarSolicitacoesMes();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        throw error;
    }
}

// Carregar solicitações do mês filtrado
async function carregarSolicitacoesMes() {
    try {
        solicitacoesCache = [];
        
        // Se não tem OPM selecionada, não carrega nada
        if (!opmSelecionada && opmsPermitidas.length > 0) {
            opmSelecionada = opmsPermitidas[0];
        }
        
        if (!opmSelecionada) return;
        
        // Construir prefixo para busca (OPM+AAAAMM)
        const mesStr = mesFiltro.toString().padStart(2, '0');
        const prefixoBusca = `${opmSelecionada}${anoFiltro}${mesStr}`;
        
        // Buscar todas solicitações
        const solicitacoesRef = ref(database, 'solicitacoes');
        const snapshot = await get(solicitacoesRef);
        
        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([id, dados]) => {
                // Filtrar por OPM e mês
                if (id.startsWith(prefixoBusca.substring(0, 15))) { // OPM(9) + Composição(5) + AAAAMM(6) = 20 chars
                    solicitacoesCache.push({
                        id: id,
                        ...dados
                    });
                }
            });
            
            // Ordenar por data e horário
            solicitacoesCache.sort((a, b) => {
                const dataA = new Date(a.data + 'T' + a.horario_inicial);
                const dataB = new Date(b.data + 'T' + b.horario_inicial);
                return dataA - dataB;
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar solicitações:', error);
        throw error;
    }
}

// Renderizar interface completa
function renderInterface() {
    const content = document.getElementById('solicitacoes-content');
    if (!content) return;
    
    content.innerHTML = `
        <!-- Parte 1: Filtros -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0"><i class="fas fa-filter me-2"></i>Filtros</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-3 align-items-end">
                            <div class="col-lg-3 col-md-4">
                                <label class="form-label">OPM / Estação</label>
                                <select class="form-select" id="selectOpm">
                                    ${opmsPermitidas.map(opm => `
                                        <option value="${opm}" ${opm === opmSelecionada ? 'selected' : ''}>
                                            ${opmsNomes[opm] || opm}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="col-lg-2 col-md-3">
                                <label class="form-label">Mês</label>
                                <select class="form-select" id="selectMes">
                                    ${Array.from({length: 12}, (_, i) => {
                                        const mesNum = i + 1;
                                        const mesNome = new Date(2000, i).toLocaleDateString('pt-BR', {month: 'long'});
                                        return `<option value="${mesNum}" ${mesNum === mesFiltro ? 'selected' : ''}>
                                            ${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}
                                        </option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-lg-2 col-md-3">
                                <label class="form-label">Ano</label>
                                <select class="form-select" id="selectAno">
                                    ${Array.from({length: 5}, (_, i) => {
                                        const ano = new Date().getFullYear() - 2 + i;
                                        return `<option value="${ano}" ${ano === anoFiltro ? 'selected' : ''}>
                                            ${ano}
                                        </option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-lg-2 col-md-2">
                                <button class="btn btn-primary w-100" id="btnAtualizarFiltro">
                                    <i class="fas fa-sync me-1"></i>Atualizar
                                </button>
                            </div>
                            ${userDataCache.nivel === 1 ? `
                            <div class="col-lg-3 col-md-4">
                                <button class="btn btn-success w-100" id="btnExportarCSV">
                                    <i class="fas fa-file-export me-1"></i>Exportar CSV
                                </button>
                                <small class="text-muted">Apenas administradores</small>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Parte 2: Nova Solicitação -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-success text-white">
                        <h5 class="mb-0"><i class="fas fa-plus-circle me-2"></i>Nova Solicitação</h5>
                    </div>
                    <div class="card-body">
                        <form id="formNovaSolicitacao">
                            <!-- Linha 1: Data e Horários -->
                            <div class="row g-3 mb-3">
                                <div class="col-xl-2 col-lg-3 col-md-4">
                                    <label class="form-label">Data <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control datepicker" 
                                           id="inputData" required
                                           placeholder="dd/mm/aaaa">
                                </div>
                                
                                <div class="col-xl-2 col-lg-2 col-md-3">
                                    <label class="form-label">Horário Inicial <span class="text-danger">*</span></label>
                                    <input type="time" class="form-control" 
                                           id="inputHorarioInicial" required
                                           step="300">
                                </div>
                                
                                <div class="col-xl-2 col-lg-2 col-md-3">
                                    <label class="form-label">Horário Final</label>
                                    <input type="time" class="form-control" 
                                           id="inputHorarioFinal" readonly
                                           style="background-color: #e9ecef;">
                                    <small class="text-muted">+8 horas</small>
                                </div>
                                
                                <div class="col-xl-3 col-lg-3 col-md-6">
                                    <label class="form-label">Composição <span class="text-danger">*</span></label>
                                    <select class="form-select" id="selectComposicao" required>
                                        <option value="">Selecione...</option>
                                        ${opmSelecionada && composicoesDisponiveis[opmSelecionada] ? 
                                            Object.entries(composicoesDisponiveis[opmSelecionada]).map(([cod, dados]) => `
                                                <option value="${cod}">${dados.composicao} (${cod})</option>
                                            `).join('') : ''
                                        }
                                    </select>
                                </div>
                                
                                <div class="col-xl-3 col-lg-2 col-md-6">
                                    <label class="form-label">Prioridade <span class="text-danger">*</span></label>
                                    <select class="form-select" id="selectPrioridade" required>
                                        <option value="">Selecione...</option>
                                        <option value="minimo_operacional">Mínimo Operacional</option>
                                        <option value="viatura_extra">Viatura Extra</option>
                                        <option value="vistoria_tecnica">Vistoria Técnica</option>
                                    </select>
                                </div>
                            </div>
                            
                            <!-- Linha 2: Vagas -->
                            <div class="row g-3 mb-3">
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Subten/Sgt <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center" 
                                           id="inputVagasSubten" min="0" max="99" 
                                           required style="max-width: 80px;">
                                </div>
                                
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Cb/Sd <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center" 
                                           id="inputVagasCbSd" min="0" max="99" 
                                           required style="max-width: 80px;">
                                </div>
                                
                                <div class="col-xl-10 col-lg-10 col-md-8 col-sm-6">
                                    <label class="form-label">Expandir escala para:</label>
                                    <div id="divDiasMes" class="d-flex flex-wrap gap-1 p-2 border rounded bg-light">
                                        <!-- Dias serão gerados dinamicamente -->
                                        <div class="text-muted small">Selecione uma data primeiro</div>
                                    </div>
                                    <small class="text-muted">Dias retroativos ficam desabilitados (cinza)</small>
                                </div>
                            </div>
                            
                            <!-- Linha 3: Motivo e Observações -->
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Motivo</label>
                                    <textarea class="form-control" id="inputMotivo" rows="2"
                                              placeholder="(informar o que levou a solicitação)"></textarea>
                                </div>
                                
                                <div class="col-md-6">
                                    <label class="form-label">Observações</label>
                                    <textarea class="form-control" id="inputObservacoes" rows="2"
                                              placeholder="(anotações para lembretes particulares)"></textarea>
                                </div>
                            </div>
                            
                            <!-- Linha 4: Anexo -->
                            <div class="row g-3 mb-3">
                                <div class="col-12" id="divAnexo" style="display: none;">
                                    <div class="border rounded p-3 bg-light">
                                        <label class="form-label fw-bold mb-2" id="labelAnexo"></label>
                                        <div class="d-flex align-items-center gap-3">
                                            <input type="file" class="form-control w-auto" id="inputAnexo" 
                                                   accept=".pdf,.jpg,.jpeg,.png">
                                            <small class="text-muted flex-grow-1" id="textoAjudaAnexo"></small>
                                        </div>
                                        <div class="progress mt-2" style="height: 6px; display: none;" id="progressAnexo">
                                            <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                                 style="width: 0%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Linha 5: Botões -->
                            <div class="row g-3">
                                <div class="col-12">
                                    <div class="d-flex justify-content-end gap-2">
                                        <button type="button" class="btn btn-outline-secondary" id="btnLimparForm">
                                            <i class="fas fa-broom me-1"></i>Limpar Tudo
                                        </button>
                                        <button type="submit" class="btn btn-success" id="btnCadastrar">
                                            <i class="fas fa-save me-1"></i>Cadastrar Solicitação
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                        
                        <!-- Mensagens de erro/sucesso -->
                        <div id="mensagensForm" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Parte 3: Tabela de Solicitações -->
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-info text-white d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-list me-2"></i>Solicitações do Mês</h5>
                        <div class="badge bg-light text-dark fs-6">
                            <span id="contadorSolicitacoes">0</span> solicitações
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                            <table class="table table-hover table-sm mb-0" id="tabelaSolicitacoes">
                                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                                    <tr>
                                        <th width="80">AÇÕES</th>
                                        <th width="90">DATA</th>
                                        <th>COMPOSIÇÃO</th>
                                        <th width="70">COD</th>
                                        <th width="120">HORÁRIO</th>
                                        <th width="100">VAGAS</th>
                                        <th width="70" class="text-center">PRIOR.</th>
                                        <th width="70" class="text-center">STATUS</th>
                                        <th width="80">ID</th>
                                        <th width="140">PRAZO</th>
                                        <th width="100">ESCALADO</th>
                                        <th width="50"></th>
                                    </tr>
                                </thead>
                                <tbody id="tbodySolicitacoes">
                                    <tr>
                                        <td colspan="12" class="text-center py-5">
                                            <div class="spinner-border text-primary"></div>
                                            <p class="mt-2 text-muted">Carregando solicitações...</p>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Inicializar componentes
    inicializarDatepicker();
    inicializarEventListeners();
    atualizarTabelaSolicitacoes(); // Carregar tabela IMEDIATAMENTE
    
    // Configurar cálculo automático de horário final
    document.getElementById('inputHorarioInicial').addEventListener('change', calcularHorarioFinal);
    
    // Atualizar dias do mês quando data mudar
    document.getElementById('inputData').addEventListener('change', atualizarDiasMes);
}

// Inicializar Google Drive API
function inicializarGoogleDrive() {
    return new Promise((resolve) => {
        // Verificar se gapi já está disponível
        if (window.gapi && window.gapi.load) {
            console.log('📱 gapi disponível, tentando inicializar...');
            
            // Tentar inicializar, mas não falhar se der erro
            gapi.load('client', () => {
                gapi.client.init({
                    apiKey: API_KEY,
                    clientId: CLIENT_ID,
                    discoveryDocs: DISCOVERY_DOCS,
                    scope: SCOPES
                }).then(() => {
                    gapiInicializada = true;
                    console.log('✅ Google Drive API inicializada');
                    resolve(true);
                }).catch((error) => {
                    console.warn('⚠️ Google Drive não inicializou:', error.message);
                    gapiInicializada = false;
                    resolve(false); // Não rejeitar, apenas continuar
                });
            });
        } else {
            console.log('📱 Google Drive não está disponível (ignorando)');
            gapiInicializada = false;
            resolve(false);
        }
    });
}

// Função separada para carregar o cliente
async function carregarClienteGoogleDrive() {
    try {
        await gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: API_KEY,
                clientId: CLIENT_ID,
                discoveryDocs: DISCOVERY_DOCS,
                scope: SCOPES
            });
            
            gapiInicializada = true;
            console.log('✅ Google Drive API inicializada com sucesso');
        });
        return true;
    } catch (error) {
        console.warn('⚠️ Erro ao inicializar Google Drive:', error);
        gapiInicializada = false;
        return false;
    }
}

// Função para upload no Google Drive
async function uploadParaGoogleDrive(arquivo, nomeArquivo) {
    if (!gapiInicializada) {
        throw new Error('Google Drive não inicializado. Por favor, faça login no Google ou tente novamente mais tarde.');
    }
    
    try {
        const metadata = {
            name: nomeArquivo,
            mimeType: arquivo.type,
            parents: ['root']
        };
        
        const accessToken = gapi.auth.getToken();
        if (!accessToken) {
            throw new Error('Não autenticado no Google Drive. Faça login primeiro.');
        }
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', arquivo);
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken.access_token
            },
            body: form
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Erro no upload');
        }
        
        const data = await response.json();
        return `https://drive.google.com/file/d/${data.id}/view`;
        
    } catch (error) {
        console.error('Erro no upload Google Drive:', error);
        
        // Fallback: Converter para Base64 e salvar no Firebase
        if (arquivo.size < 1000000) { // Apenas para arquivos < 1MB
            console.log('📦 Usando fallback Base64 para arquivo pequeno');
            return await converterParaBase64(arquivo);
        } else {
            throw new Error(`Arquivo muito grande para fallback. Use um arquivo menor ou configure o Google Drive. Erro: ${error.message}`);
        }
    }
}

// Função fallback para converter arquivo para Base64
function converterParaBase64(arquivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result); // Retorna data URL
        };
        reader.onerror = reject;
        reader.readAsDataURL(arquivo);
    });
}

// Inicializar datepicker
function inicializarDatepicker() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    
    flatpickr('.datepicker', {
        dateFormat: 'd/m/Y',
        locale: 'pt',
        minDate: amanha, // ⬅️ Apenas dia seguinte em diante
        disableMobile: true,
        defaultDate: amanha, // ⬅️ Define amanhã como padrão
        onChange: function(selectedDates, dateStr, instance) {
            atualizarDiasMes();
        }
    });
}

// Calcular horário final (+8 horas)
function calcularHorarioFinal() {
    const inputInicial = document.getElementById('inputHorarioInicial');
    const inputFinal = document.getElementById('inputHorarioFinal');
    
    if (!inputInicial.value) {
        inputFinal.value = '';
        return;
    }
    
    const [horas, minutos] = inputInicial.value.split(':').map(Number);
    let horasFinais = horas + 8;
    
    // Ajustar se passar das 24h
    if (horasFinais >= 24) {
        horasFinais -= 24;
    }
    
    inputFinal.value = `${horasFinais.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
    
    // Validar vistoria técnica após 19:00 (NOVO)
    const prioridade = document.getElementById('selectPrioridade').value;
    if (prioridade === 'vistoria_tecnica') {
        const horarioFinal = new Date();
        horarioFinal.setHours(horasFinais, minutos, 0, 0);
        const limite = new Date();
        limite.setHours(19, 0, 0, 0);
        
        if (horarioFinal > limite) {
            // Mostrar alerta modal
            mostrarAlertaVistoriaTecnica().then(() => {
                // Focar no campo motivo
                document.getElementById('inputMotivo').focus();
            });
        }
    }
}

// Atualizar dias do mês no formulário
function atualizarDiasMes() {
    const divDias = document.getElementById('divDiasMes');
    if (!divDias) return;
    
    // Obter data selecionada
    const inputData = document.getElementById('inputData');
    if (!inputData.value) {
        divDias.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
        return;
    }
    
    // Extrair dia, mês e ano da data selecionada
    const [diaSelecionadoStr, mesStr, anoStr] = inputData.value.split('/');
    const diaSelecionado = parseInt(diaSelecionadoStr);
    const mes = parseInt(mesStr);
    const ano = parseInt(anoStr);
    
    // Quantidade de dias no mês
    const ultimoDia = new Date(ano, mes, 0).getDate();
    
    // Gerar checkboxes
    let html = '';
    for (let dia = 1; dia <= ultimoDia; dia++) {
        const dataCompleta = `${ano}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
        const dataDia = new Date(dataCompleta);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        // Dias retroativos (anteriores à data selecionada) ficam desabilitados
        const isDiaRetroativo = dia < diaSelecionado;
        
        // Validar vistoria técnica (máx 10 dias à frente da data ATUAL)
        const prioridade = document.getElementById('selectPrioridade').value;
        let disabledPorVistoria = false;
        let title = '';
        
        if (prioridade === 'vistoria_tecnica') {
            const diffDias = Math.floor((dataDia - hoje) / (1000 * 60 * 60 * 24));
            if (diffDias > 10) {
                disabledPorVistoria = true;
                title = 'Vistoria técnica: máximo 10 dias à frente da data atual';
            }
        }
        
        // Dias retroativos OU dias após limite de vistoria ficam desabilitados
        const disabled = isDiaRetroativo || disabledPorVistoria;
        
        // O dia selecionado já está automaticamente incluído (não precisa marcar)
        const checked = dia === diaSelecionado;
        
        html += `
            <div class="form-check form-check-inline m-0">
                <input class="form-check-input" type="checkbox" 
                       id="dia${dia}" value="${dia}"
                       ${disabled ? 'disabled' : ''}
                       ${checked ? 'checked style="display: none;"' : ''}
                       title="${title}"
                       ${isDiaRetroativo ? 'style="opacity: 0.5;"' : ''}>
                <label class="form-check-label small ${isDiaRetroativo ? 'text-muted' : ''}" 
                       for="dia${dia}" 
                       style="padding: 2px 8px; border-radius: 4px; 
                              ${isDiaRetroativo ? 'background-color: #f8f9fa;' : ''}">
                    ${dia.toString().padStart(2, '0')}
                </label>
            </div>
        `;
    }
    
    divDias.innerHTML = html || '<small class="text-muted">Nenhum dia disponível neste mês</small>';
    
    // Adicionar mensagem informativa
    if (diaSelecionado) {
        const info = document.createElement('div');
        info.className = 'small text-muted mt-2';
        info.innerHTML = `<i class="fas fa-info-circle me-1"></i> O dia ${diaSelecionado} está automaticamente incluído`;
        divDias.appendChild(info);
    }
}

// Inicializar event listeners
function inicializarEventListeners() {
    // Filtros
    document.getElementById('selectOpm').addEventListener('change', async (e) => {
        opmSelecionada = e.target.value;
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        atualizarComposicoesDropdown();
    });
    
    document.getElementById('selectMes').addEventListener('change', (e) => {
        mesFiltro = parseInt(e.target.value);
    });
    
    document.getElementById('selectAno').addEventListener('change', (e) => {
        anoFiltro = parseInt(e.target.value);
    });
    
    document.getElementById('btnAtualizarFiltro').addEventListener('click', async () => {
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
    });
    
    // Formulário
    document.getElementById('inputData').addEventListener('change', atualizarDiasMes);
    document.getElementById('selectPrioridade').addEventListener('change', (e) => {
        atualizarCampoAnexo(e.target.value);
        atualizarDiasMes(); // Revalidar dias para vistoria técnica
        calcularHorarioFinal(); // Revalidar horário para vistoria técnica
    });
    
    document.getElementById('formNovaSolicitacao').addEventListener('submit', async (e) => {
        e.preventDefault();
        await cadastrarSolicitacao();
    });
    
    document.getElementById('btnLimparForm').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
            limparFormulario();
        }
    });
    
    // Exportar CSV (apenas admin)
    if (userDataCache.nivel === 1) {
        document.getElementById('btnExportarCSV').addEventListener('click', exportarCSV);
    }
}

// Atualizar campo anexo conforme prioridade
function atualizarCampoAnexo(prioridade) {
    const divAnexo = document.getElementById('divAnexo');
    const labelAnexo = document.getElementById('labelAnexo');
    const textoAjuda = document.getElementById('textoAjudaAnexo');
    
    if (prioridade === 'minimo_operacional') {
        divAnexo.style.display = 'block';
        labelAnexo.textContent = 'EB - Escala Operacional';
        textoAjuda.textContent = 'Anexe o documento EB - Escala Operacional';
        textoAjuda.className = 'text-muted';
    } else if (prioridade === 'vistoria_tecnica') {
        divAnexo.style.display = 'block';
        labelAnexo.textContent = 'SAT - Relatório de Vistorias Atrasadas';
        textoAjuda.textContent = 'Anexe o relatório SAT de vistorias atrasadas';
        textoAjuda.className = 'text-muted';
    } else {
        divAnexo.style.display = 'none';
    }
}

// Atualizar dropdown de composições
function atualizarComposicoesDropdown() {
    const select = document.getElementById('selectComposicao');
    if (!select || !opmSelecionada) return;
    
    // Limpar opções exceto a primeira
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // Adicionar composições da OPM selecionada
    if (composicoesDisponiveis[opmSelecionada]) {
        Object.entries(composicoesDisponiveis[opmSelecionada]).forEach(([cod, dados]) => {
            const option = document.createElement('option');
            option.value = cod;
            option.textContent = `${dados.composicao} (${cod})`;
            select.appendChild(option);
        });
    }
}

// Cadastrar nova solicitação
async function cadastrarSolicitacao() {
    try {
        const btnCadastrar = document.getElementById('btnCadastrar');
        const originalText = btnCadastrar.innerHTML;
        btnCadastrar.disabled = true;
        btnCadastrar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Processando...';
        
        // Coletar dados do formulário
        const formData = coletarDadosFormulario();
        
        // Validar dados
        const validacao = validarDadosFormulario(formData);
        if (!validacao.valido) {
            mostrarMensagemFormulario(validacao.mensagem, 'danger');
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }
        
        // Verificar duplicidade
        const diasDuplicados = await verificarDuplicidade(formData);
        if (diasDuplicados.length > 0) {
            mostrarMensagemFormulario(
                `❌ Os dias ${diasDuplicados.join(', ')} já possuem solicitação cadastrada. ` +
                `Desmarque-os e tente novamente.`,
                'danger'
            );
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }
        
        // Upload de anexo se houver
        let linkAnexo = null;
        const inputAnexo = document.getElementById('inputAnexo');
        if (inputAnexo.files.length > 0) {
            try {
                linkAnexo = await processarUploadAnexo(inputAnexo.files[0], formData);
            } catch (anexoError) {
                console.warn('Erro no anexo:', anexoError);
                // Continuar sem anexo
            }
        }
        
        // Cadastrar cada dia selecionado
        let sucessos = 0;
        let erros = [];
        
        for (const dia of formData.diasSelecionados) {
            try {
                await cadastrarDiaSolicitacao(formData, dia, linkAnexo);
                sucessos++;
            } catch (error) {
                erros.push(`Dia ${dia}: ${error.message}`);
            }
        }
        
        if (sucessos > 0) {
            mostrarMensagemFormulario(
                `✅ ${sucessos} solicitação(ões) cadastrada(s) com sucesso!`,
                'success'
            );
            
            // Atualizar tabela
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
            
            // Limpar formulário AUTOMATICAMENTE (sem confirmação)
            // limparFormularioSilencioso();
        }
        
        if (erros.length > 0) {
            mostrarMensagemFormulario(
                `⚠️ ${sucessos} cadastradas, ${erros.length} com erro:<br>${erros.join('<br>')}`,
                'warning'
            );
        }
        
    } catch (error) {
        console.error('Erro ao cadastrar:', error);
        mostrarMensagemFormulario(`❌ Erro: ${error.message}`, 'danger');
    } finally {
        const btnCadastrar = document.getElementById('btnCadastrar');
        btnCadastrar.disabled = false;
        btnCadastrar.innerHTML = '<i class="fas fa-save me-1"></i>Cadastrar';
    }
}

// Nova função para limpar formulário sem confirmação
function limparFormularioSilencioso() {
    document.getElementById('formNovaSolicitacao').reset();
    document.getElementById('inputHorarioFinal').value = '';
    document.getElementById('divDiasMes').innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
    document.getElementById('divAnexo').style.display = 'none';
}

// Coletar dados do formulário
function coletarDadosFormulario() {
    const dataInput = document.getElementById('inputData').value;
    if (!dataInput) {
        throw new Error('Data é obrigatória');
    }
    
    const [diaStr, mesStr, anoStr] = dataInput.split('/');
    const dataBase = `${anoStr}-${mesStr.padStart(2, '0')}-${diaStr.padStart(2, '0')}`;
    const diaSelecionado = parseInt(diaStr);
    
    // Dias selecionados (INCLUINDO o dia da data selecionada automaticamente)
    const diasSelecionados = [diaSelecionado]; // Começa com o dia selecionado
    
    // Adicionar outros dias marcados
    document.querySelectorAll('#divDiasMes input[type="checkbox"]:checked').forEach(cb => {
        if (!cb.disabled) {
            const dia = parseInt(cb.value);
            if (dia !== diaSelecionado) { // Não adicionar duplicado
                diasSelecionados.push(dia);
            }
        }
    });
    
    return {
        opm_codigo: opmSelecionada,
        opm_nome: opmsNomes[opmSelecionada] || opmSelecionada,
        composicao_cod: document.getElementById('selectComposicao').value,
        data_base: dataBase,
        dia_selecionado: diaSelecionado,
        horario_inicial: document.getElementById('inputHorarioInicial').value,
        horario_final: document.getElementById('inputHorarioFinal').value,
        vagas_subten_sgt: parseInt(document.getElementById('inputVagasSubten').value),
        vagas_cb_sd: parseInt(document.getElementById('inputVagasCbSd').value),
        prioridade: document.getElementById('selectPrioridade').value,
        motivo: document.getElementById('inputMotivo').value.trim(),
        observacoes: document.getElementById('inputObservacoes').value.trim(),
        diasSelecionados: diasSelecionados,
        tem_anexo: document.getElementById('inputAnexo').files.length > 0
    };
}

// Validar dados do formulário
function validarDadosFormulario(dados) {
    // Validar vistoria técnica após 19:00
    if (dados.prioridade === 'vistoria_tecnica') {
        const [horas, minutos] = dados.horario_final.split(':').map(Number);
        if ((horas > 19) || (horas === 19 && minutos > 0)) {
            if (!dados.motivo || !dados.motivo.toLowerCase().includes('expediente')) {
                return {
                    valido: false,
                    mensagem: 'Para vistoria técnica com horário final após 19:00, ' +
                             'é obrigatório informar no campo "Motivo" o porquê da ' +
                             'necessidade de avançar o horário expediente.'
                };
            }
        }
        
        // Validar máximo 10 dias à frente
        const dataBase = new Date(dados.data_base);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        for (const dia of dados.diasSelecionados) {
            const dataDia = new Date(dataBase.getFullYear(), dataBase.getMonth(), dia);
            const diffDias = Math.floor((dataDia - hoje) / (1000 * 60 * 60 * 24));
            
            if (diffDias > 10) {
                return {
                    valido: false,
                    mensagem: `Vistoria técnica: O dia ${dia}/${dataBase.getMonth() + 1} ` +
                             `está mais de 10 dias à frente. Máximo permitido: 10 dias.`
                };
            }
        }
    }
    
    // Validar dias selecionados
    if (dados.diasSelecionados.length === 0) {
        return {
            valido: false,
            mensagem: 'Selecione pelo menos um dia para a escala.'
        };
    }
    
    return { valido: true, mensagem: '' };
}

// Função para mostrar alerta modal (19:00)
function mostrarAlertaVistoriaTecnica() {
    return new Promise((resolve) => {
        // Criar modal de alerta
        const modalHTML = `
            <div class="modal fade" id="modalAlertaVistoria" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                ATENÇÃO - Vistoria Técnica
                            </h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-3">
                                <strong>Para vistoria técnica com horário final após 19:00,</strong>
                                é obrigatório informar no campo "Motivo" o porquê da necessidade 
                                de avançar o horário expediente.
                            </p>
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                Por favor, adicione essa informação antes de continuar.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" id="btnEntendiAlerta">
                                <i class="fas fa-check me-1"></i>Entendi, vou adicionar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar ao DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('modalAlertaVistoria'));
        modal.show();
        
        // Configurar botão
        document.getElementById('btnEntendiAlerta').addEventListener('click', () => {
            modal.hide();
            setTimeout(() => {
                modalContainer.remove();
                resolve();
            }, 300);
        });
        
        // Focar no campo motivo quando modal fechar
        document.getElementById('modalAlertaVistoria').addEventListener('hidden.bs.modal', () => {
            document.getElementById('inputMotivo').focus();
        });
    });
}

// Verificar duplicidade
async function verificarDuplicidade(dados) {
    const diasDuplicados = [];
    
    for (const dia of dados.diasSelecionados) {
        const dataCompleta = `${dados.data_base.substring(0, 8)}${dia.toString().padStart(2, '0')}`;
        const idSolicitacao = `${dados.opm_codigo}${dados.composicao_cod}${dataCompleta.replace(/-/g, '')}${dados.horario_inicial.replace(/:/g, '')}`;
        
        // Verificar se já existe no Firebase
        const solicitacaoRef = ref(database, `solicitacoes/${idSolicitacao}`);
        const snapshot = await get(solicitacaoRef);
        
        if (snapshot.exists()) {
            diasDuplicados.push(dia);
        }
    }
    
    return diasDuplicados;
}

// Processar upload de anexo
async function processarUploadAnexo(arquivo, dados) {
    const progressBar = document.getElementById('progressAnexo');
    const progressFill = progressBar.querySelector('.progress-bar');
    
    // Mostrar progresso
    progressBar.style.display = 'block';
    progressFill.style.width = '25%';
    
    try {
        // Gerar nome do arquivo
        const mesAno = dados.data_base.substring(0, 7).replace(/-/g, '');
        const baseNome = `${dados.opm_codigo}${dados.composicao_cod}${mesAno}`;
        
        // Sequência incremental simples (em produção, verificaria no Firebase)
        let sequencia = 1;
        const extensao = arquivo.name.substring(arquivo.name.lastIndexOf('.'));
        let nomeArquivo = `${baseNome}${sequencia.toString().padStart(2, '0')}${extensao}`;
        
        progressFill.style.width = '50%';
        
        let urlAnexo;
        try {
            // Tentar Google Drive primeiro
            urlAnexo = await uploadParaGoogleDrive(arquivo, nomeArquivo);
            progressFill.style.width = '100%';
            
        } catch (driveError) {
            console.warn('Google Drive falhou, usando fallback:', driveError);
            progressFill.style.width = '75%';
            
            // Fallback: salvar no Firebase como texto base64 (para arquivos pequenos)
            if (arquivo.size < 1000000) {
                urlAnexo = await converterParaBase64(arquivo);
                progressFill.style.width = '100%';
                
                // Mostrar aviso
                mostrarMensagemFormulario(
                    '⚠️ Anexo salvo localmente (Google Drive não disponível). ' +
                    'Para arquivos maiores, configure o Google Drive.',
                    'warning'
                );
            } else {
                throw new Error('Arquivo muito grande. Configure o Google Drive para anexos maiores que 1MB.');
            }
        }
        
        // Esconder progress bar
        setTimeout(() => {
            progressBar.style.display = 'none';
            progressFill.style.width = '0%';
        }, 1000);
        
        return urlAnexo;
        
    } catch (error) {
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
        throw new Error(`Falha no processamento do anexo: ${error.message}`);
    }
}

// Cadastrar um dia específico da solicitação
async function cadastrarDiaSolicitacao(dados, dia, linkAnexo) {
    // Construir data completa
    const dataCompleta = `${dados.data_base.substring(0, 8)}${dia.toString().padStart(2, '0')}`;
    
    // Gerar ID único
    const idSolicitacao = `${dados.opm_codigo}${dados.composicao_cod}${dataCompleta.replace(/-/g, '')}${dados.horario_inicial.replace(/:/g, '')}`;
    
    // Dados para salvar (SEM HISTÓRICO AQUI - será adicionado depois)
    const dadosSolicitacao = {
        data: dataCompleta,
        opm_codigo: dados.opm_codigo,
        opm_nome: dados.opm_nome,
        composicao_cod: dados.composicao_cod,
        composicao_nome: composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod]?.composicao || '',
        descricao: composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod]?.descricao || '',
        horario_inicial: dados.horario_inicial,
        horario_final: dados.horario_final,
        vagas_subten_sgt: dados.vagas_subten_sgt,
        vagas_cb_sd: dados.vagas_cb_sd,
        prioridade: dados.prioridade,
        motivo: dados.motivo,
        observacoes: dados.observacoes,
        comprovante_url: linkAnexo,
        criado_por_re: userRE,
        criado_por_nome: userDataCache.nome,
        criado_em: new Date().toISOString()
    };
    
    // Salvar no Firebase
    const solicitacaoRef = ref(database, `solicitacoes/${idSolicitacao}`);
    await set(solicitacaoRef, dadosSolicitacao);
    
    // Agora adicionar histórico separadamente
    const historicoRef = ref(database, `solicitacoes/${idSolicitacao}/historico`);
    const entradaHistorico = criarEntradaHistorico('criacao', {
        dados_completos: 'Solicitação criada'
    });
    await update(historicoRef, entradaHistorico);
}

// NOVA FUNÇÃO para criar timestamp válido para Firebase
function criarTimestampFirebase() {
    const now = new Date();
    // Formato: YYYYMMDDHHMMSS (sem caracteres especiais)
    const timestamp = 
        now.getFullYear() + 
        String(now.getMonth() + 1).padStart(2, '0') + 
        String(now.getDate()).padStart(2, '0') + 
        String(now.getHours()).padStart(2, '0') + 
        String(now.getMinutes()).padStart(2, '0') + 
        String(now.getSeconds()).padStart(2, '0') + 
        String(now.getMilliseconds()).padStart(3, '0');
    return timestamp;
}

// NOVA FUNÇÃO para criar objeto de histórico
function criarEntradaHistorico(acao, dados = {}) {
    const timestamp = criarTimestampFirebase();
    return {
        [timestamp]: {
            acao: acao,
            alterado_por_re: userRE,
            alterado_por_nome: userDataCache.nome,
            ...dados
        }
    };
}

// Limpar formulário
function limparFormulario() {
    if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
        document.getElementById('formNovaSolicitacao').reset();
        document.getElementById('inputHorarioFinal').value = '';
        document.getElementById('divDiasMes').innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
        document.getElementById('divAnexo').style.display = 'none';
        document.getElementById('mensagensForm').innerHTML = '';
    }
}

// Mostrar mensagem no formulário
function mostrarMensagemFormulario(mensagem, tipo) {
    const mensagensDiv = document.getElementById('mensagensForm');
    if (!mensagensDiv) return;
    
    const alertClass = {
        'success': 'alert-success',
        'danger': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[tipo] || 'alert-info';
    
    mensagensDiv.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show">
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
}

// Atualizar tabela de solicitações
async function atualizarTabelaSolicitacoes() {
    const tbody = document.getElementById('tbodySolicitacoes');
    const contador = document.getElementById('contadorSolicitacoes');
    
    if (!tbody || !contador) {
        console.error('Elementos da tabela não encontrados');
        return;
    }
    
    try {
        // Mostrar carregando
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-5">
                    <div class="spinner-border text-primary"></div>
                    <p class="mt-2 text-muted">Carregando solicitações...</p>
                </td>
            </tr>
        `;
        
        // Tentar carregar solicitações
        await carregarSolicitacoesMes();
        
        // Atualizar contador
        contador.textContent = solicitacoesCache.length;
        
        if (solicitacoesCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox fa-2x mb-3"></i><br>
                        Nenhuma solicitação encontrada para este mês
                    </td>
                </tr>
            `;
            return;
        }
        
        // Gerar linhas da tabela
        let html = '';
        solicitacoesCache.forEach((solicitacao) => {
            if (!solicitacao || !solicitacao.data) {
                console.warn('Solicitação inválida:', solicitacao);
                return;
            }
            
            const dataObj = new Date(solicitacao.data);
            const dataFormatada = isNaN(dataObj.getTime()) ? 'Data inválida' : dataObj.toLocaleDateString('pt-BR');
            
            // Status
            const statusIcon = getIconeStatus(solicitacao.status);
            const statusClass = getClasseStatus(solicitacao.status);
            
            // Prioridade
            const prioridadeIcon = getIconePrioridade(solicitacao.prioridade);
            
            // Ações (ícones)
            const acoesHTML = gerarAcoesHTML(solicitacao);
            
            // Vagas
            const vagasSolicitadas = `${solicitacao.vagas_subten_sgt || 0} / ${solicitacao.vagas_cb_sd || 0}`;
            
            // Escalado
            const escaladoHTML = gerarEscaladoHTML(solicitacao);
            
            // Prazo de inscrição
            let prazoHTML = '-';
            if (solicitacao.prazo_inscricao) {
                try {
                    const prazoDate = new Date(solicitacao.prazo_inscricao);
                    if (!isNaN(prazoDate.getTime())) {
                        prazoHTML = prazoDate.toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }
                } catch (e) {
                    console.warn('Erro ao formatar prazo:', e);
                }
            }
            
            // ID do sistema
            const idSistema = solicitacao.id_sistema_local || '-';
            
            // Linha da tabela
            html += `
                <tr class="${statusClass} align-middle" id="linha-${solicitacao.id}">
                    <td class="py-2">${acoesHTML}</td>
                    <td class="py-2"><strong>${dataFormatada}</strong></td>
                    <td class="py-2">${solicitacao.composicao_nome || ''}</td>
                    <td class="py-2"><code>${solicitacao.composicao_cod || ''}</code></td>
                    <td class="py-2">${solicitacao.horario_inicial || ''} às ${solicitacao.horario_final || ''}</td>
                    <td class="py-2">${vagasSolicitadas}</td>
                    <td class="text-center py-2">${prioridadeIcon}</td>
                    <td class="text-center py-2">
                        <span class="status-icon" data-id="${solicitacao.id}" 
                              data-status="${solicitacao.status || ''}" 
                              style="cursor: ${userDataCache.nivel === 1 ? 'pointer' : 'default'}; 
                                     font-size: 1.1em;">
                            ${statusIcon}
                        </span>
                    </td>
                    <td class="py-2"><small>${idSistema}</small></td>
                    <td class="py-2"><small>${prazoHTML}</small></td>
                    <td class="py-2">${escaladoHTML}</td>
                    <td class="text-center py-2">
                        <button class="btn btn-sm btn-outline-info btn-detalhes" 
                                data-id="${solicitacao.id}" title="Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // Adicionar event listeners para ações
        adicionarEventListenersTabela();
        
    } catch (error) {
        console.error('Erro ao atualizar tabela:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i><br>
                    Erro ao carregar solicitações<br>
                    <small>${error.message}</small>
                </td>
            </tr>
        `;
    }
}

// Gerar HTML das ações
function gerarAcoesHTML(solicitacao) {
    // Se tem status 1, 2 ou 3, não mostra ações para usuário normal
    if ([1, 2, 3].includes(solicitacao.status)) {
        return userDataCache.nivel === 1 ? 
            '<small class="text-muted">Admin only</small>' : 
            '<small class="text-muted">-</small>';
    }
    
    // Status 4 (em edição) - mostra botões de confirmação
    if (solicitacao.status === 4) {
        return `
            <div class="btn-group btn-group-sm">
                <button class="btn btn-warning btn-atualizar" data-id="${solicitacao.id}" title="Atualizar">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="btn btn-secondary btn-cancelar-edicao" data-id="${solicitacao.id}" title="Cancelar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }
    
    // Status 5 (excluído) - mostra botão para reativar (apenas admin)
    if (solicitacao.status === 5) {
        return userDataCache.nivel === 1 ? `
            <button class="btn btn-sm btn-success btn-reativar" data-id="${solicitacao.id}" title="Reativar">
                <i class="fas fa-undo"></i>
            </button>
        ` : '<small class="text-muted">Excluído</small>';
    }
    
    // Sem status ou status 0 - mostra ações normais
    return `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary btn-editar" data-id="${solicitacao.id}" title="Editar">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-outline-danger btn-excluir" data-id="${solicitacao.id}" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// Gerar HTML do escalado
function gerarEscaladoHTML(solicitacao) {
    const escaladoSubten = solicitacao.escalado_subten_sgt || 0;
    const escaladoCbSd = solicitacao.escalado_cb_sd || 0;
    
    const subtenClass = (escaladoSubten < solicitacao.vagas_subten_sgt) ? 'text-danger' : '';
    const cbSdClass = (escaladoCbSd < solicitacao.vagas_cb_sd) ? 'text-danger' : '';
    
    return `
        <div class="small">
            <span class="${subtenClass}">${escaladoSubten}</span> / 
            <span class="${cbSdClass}">${escaladoCbSd}</span>
        </div>
    `;
}

// Adicionar event listeners à tabela
function adicionarEventListenersTabela() {
    // Botão detalhes (olho)
    document.querySelectorAll('.btn-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            mostrarDetalhesSolicitacao(id);
        });
    });
    
    // Status (admin pode clicar para liberar)
    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.status-icon').forEach(span => {
            span.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status;
                if (['1', '2', '3'].includes(status)) {
                    liberarParaEdicao(id);
                }
            });
        });
    }
    
    // Ações normais (apenas se usuário tiver permissão)
    if (userDataCache.nivel <= 2) {
        // Editar
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                iniciarEdicao(id);
            });
        });
        
        // Excluir
        document.querySelectorAll('.btn-excluir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                excluirSolicitacao(id);
            });
        });
        
        // Atualizar (durante edição)
        document.querySelectorAll('.btn-atualizar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                confirmarEdicao(id);
            });
        });
        
        // Cancelar edição
        document.querySelectorAll('.btn-cancelar-edicao').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                cancelarEdicao(id);
            });
        });
    }
    
    // Reativar (apenas admin)
    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.btn-reativar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                reativarSolicitacao(id);
            });
        });
    }
}

// Obter ícone do status
function getIconeStatus(status) {
    switch(status) {
        case 1: return '<i class="fas fa-check text-success"></i>'; // ✅
        case 2: return '<i class="fas fa-exclamation-triangle text-warning"></i>'; // ⚠️
        case 3: return '<i class="fas fa-times text-danger"></i>'; // ❌
        case 4: return '<i class="fas fa-hand-paper text-warning"></i>'; // ✋
        case 5: return '<i class="fas fa-trash text-secondary"></i>'; // 🗑️
        default: return '';
    }
}

// Obter classe CSS do status
function getClasseStatus(status) {
    switch(status) {
        case 4: return 'table-warning'; // Em edição
        case 5: return 'table-danger'; // Excluído
        default: return '';
    }
}

// Obter ícone da prioridade
function getIconePrioridade(prioridade) {
    if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
        return '<i class="fas fa-check text-success"></i>';
    }
    return '<i class="fas fa-minus text-muted"></i>';
}

// Mostrar detalhes da solicitação
async function mostrarDetalhesSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;
    
    // Preencher modal
    document.getElementById('modalMotivo').value = solicitacao.motivo || '';
    document.getElementById('modalObservacoes').value = solicitacao.observacoes || '';
    document.getElementById('modalAdministracao').value = solicitacao.administracao || '';
    
    // Mostrar anexos se existirem
    const divAnexos = document.getElementById('modalAnexos');
    if (solicitacao.comprovante_url) {
        divAnexos.innerHTML = `
            <label class="form-label">Anexo:</label>
            <div>
                <a href="${solicitacao.comprovante_url}" target="_blank" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-external-link-alt me-1"></i>Abrir anexo
                </a>
            </div>
        `;
    } else {
        divAnexos.innerHTML = '<small class="text-muted">Nenhum anexo</small>';
    }
    
    // Configurar botão salvar
    const btnSalvar = document.getElementById('btnSalvarDetalhes');
    btnSalvar.onclick = () => salvarDetalhesSolicitacao(id);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalDetalhes'));
    modal.show();
}

// Salvar detalhes da solicitação
async function salvarDetalhesSolicitacao(id) {
    try {
        const motivo = document.getElementById('modalMotivo').value;
        const observacoes = document.getElementById('modalObservacoes').value;
        
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Atualizar no Firebase
        await update(solicitacaoRef, {
            motivo: motivo,
            observacoes: observacoes,
            historico: {
                [new Date().toISOString()]: {
                    acao: 'edicao_detalhes',
                    campos_alterados: ['motivo', 'observacoes'],
                    alterado_por_re: userRE,
                    alterado_por_nome: userDataCache.nome
                }
            }
        });
        
        // Atualizar cache local
        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].motivo = motivo;
            solicitacoesCache[index].observacoes = observacoes;
        }
        
        // Fechar modal e mostrar mensagem
        bootstrap.Modal.getInstance(document.getElementById('modalDetalhes')).hide();
        mostrarMensagemFormulario('✅ Detalhes atualizados com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao salvar detalhes:', error);
        mostrarMensagemFormulario('❌ Erro ao salvar detalhes', 'danger');
    }
}

// Iniciar edição de solicitação
async function iniciarEdicao(id) {
    if (!confirm('Tem certeza que deseja editar esta solicitação?')) return;
    
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Atualizar status para 4 (em edição)
        await update(solicitacaoRef, {
            status: 4,
            historico: {
                [new Date().toISOString()]: {
                    acao: 'inicio_edicao',
                    alterado_por_re: userRE,
                    alterado_por_nome: userDataCache.nome
                }
            }
        });
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('✋ Solicitação em modo de edição', 'info');
        
    } catch (error) {
        console.error('Erro ao iniciar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao iniciar edição', 'danger');
    }
}

// Confirmar edição
async function confirmarEdicao(id) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Remover status (volta para vazio/null)
        await update(solicitacaoRef, {
            status: null
        });
        
        // Adicionar entrada de histórico
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico('confirmacao_edicao');
        await update(historicoRef, entradaHistorico);
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('✅ Edição confirmada', 'success');
        
    } catch (error) {
        console.error('Erro ao confirmar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao confirmar edição', 'danger');
    }
}

// Cancelar edição
async function cancelarEdicao(id) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Remover status (volta para vazio/null)
        await update(solicitacaoRef, {
            status: null,
            historico: {
                [new Date().toISOString()]: {
                    acao: 'cancelamento_edicao',
                    alterado_por_re: userRE,
                    alterado_por_nome: userDataCache.nome
                }
            }
        });
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('Edição cancelada', 'info');
        
    } catch (error) {
        console.error('Erro ao cancelar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao cancelar edição', 'danger');
    }
}

// Excluir solicitação
async function excluirSolicitacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta solicitação?')) return;
    
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Atualizar status para 5 (excluído)
        await update(solicitacaoRef, {
            status: 5,
            historico: {
                [new Date().toISOString()]: {
                    acao: 'exclusao',
                    alterado_por_re: userRE,
                    alterado_por_nome: userDataCache.nome
                }
            }
        });
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('🗑️ Solicitação marcada como excluída', 'warning');
        
    } catch (error) {
        console.error('Erro ao excluir:', error);
        mostrarMensagemFormulario('❌ Erro ao excluir solicitação', 'danger');
    }
}

// Reativar solicitação (apenas admin)
async function reativarSolicitacao(id) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Remover status (volta para vazio/null)
        await update(solicitacaoRef, {
            status: null,
            historico: {
                [new Date().toISOString()]: {
                    acao: 'reativacao_admin',
                    alterado_por_re: userRE,
                    alterado_por_nome: userDataCache.nome
                }
            }
        });
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('✅ Solicitação reativada', 'success');
        
    } catch (error) {
        console.error('Erro ao reativar:', error);
        mostrarMensagemFormulario('❌ Erro ao reativar solicitação', 'danger');
    }
}

// Liberar para edição (admin clica no status)
function liberarParaEdicao(id) {
    // Armazenar ID para usar no modal
    document.getElementById('btnConfirmarLiberar').dataset.id = id;
    
    const modal = new bootstrap.Modal(document.getElementById('modalLiberarEdicao'));
    modal.show();
}

// Confirmar liberação (admin)
document.addEventListener('click', async (e) => {
    if (e.target.id === 'btnConfirmarLiberar') {
        const id = e.target.dataset.id;
        
        try {
            const solicitacaoRef = ref(database, `solicitacoes/${id}`);
            
            // Remover status (volta para vazio/null)
            await update(solicitacaoRef, {
                status: null,
                historico: {
                    [new Date().toISOString()]: {
                        acao: 'liberacao_admin',
                        alterado_por_re: userRE,
                        alterado_por_nome: userDataCache.nome,
                        observacao: 'Liberado pelo administrador para edição'
                    }
                }
            });
            
            // Atualizar cache e tabela
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
            
            // Fechar modal
            bootstrap.Modal.getInstance(document.getElementById('modalLiberarEdicao')).hide();
            
            mostrarMensagemFormulario('🔓 Solicitação liberada para edição', 'success');
            
        } catch (error) {
            console.error('Erro ao liberar:', error);
            mostrarMensagemFormulario('❌ Erro ao liberar solicitação', 'danger');
        }
    }
});

// Exportar CSV (apenas admin)
async function exportarCSV() {
    try {
        // Filtrar solicitações que serão exportadas (status vazio, 4 ou 5)
        const paraExportar = solicitacoesCache.filter(s => 
            !s.status || s.status === 4 || s.status === 5
        );
        
        if (paraExportar.length === 0) {
            alert('Nenhuma solicitação para exportar.');
            return;
        }
        
        // Preparar dados para CSV
        const dadosCSV = paraExportar.map(s => ({
            ID: s.id,
            Data: new Date(s.data).toLocaleDateString('pt-BR'),
            OPM_Codigo: s.opm_codigo,
            OPM_Nome: s.opm_nome,
            Composicao_Cod: s.composicao_cod,
            Composicao_Nome: s.composicao_nome,
            Horario_Inicial: s.horario_inicial,
            Horario_Final: s.horario_final,
            Vagas_Subten_Sgt: s.vagas_subten_sgt,
            Vagas_Cb_Sd: s.vagas_cb_sd,
            Prioridade: s.prioridade,
            Motivo: s.motivo,
            Observacoes: s.observacoes,
            Status_Atual: s.status || '',
            Criado_Por: s.criado_por_nome,
            Criado_Em: new Date(s.criado_em).toLocaleString('pt-BR'),
            Anexo_URL: s.comprovante_url || '',
            Historico: JSON.stringify(s.historico || {})
        }));
        
        // Converter para CSV
        const ws = XLSX.utils.json_to_sheet(dadosCSV);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Solicitações");
        
        // Gerar nome do arquivo
        const mesStr = mesFiltro.toString().padStart(2, '0');
        const nomeArquivo = `solicitacoes_${opmSelecionada}_${anoFiltro}${mesStr}.csv`;
        
        // Salvar arquivo
        XLSX.writeFile(wb, nomeArquivo);
        
        // Atualizar status para 2 (⚠️) após exportar
        for (const solicitacao of paraExportar) {
            const solicitacaoRef = ref(database, `solicitacoes/${solicitacao.id}`);
            await update(solicitacaoRef, {
                status: 2,
                historico: {
                    [new Date().toISOString()]: {
                        acao: 'exportacao_csv',
                        exportado_por_re: userRE,
                        exportado_por_nome: userDataCache.nome
                    }
                }
            });
        }
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario(`✅ ${paraExportar.length} solicitações exportadas e bloqueadas para edição`, 'success');
        
    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        mostrarMensagemFormulario('❌ Erro ao exportar CSV', 'danger');
    }
}

// Mostrar erro
function showSolicitacoesError(error) {
    const content = document.getElementById('solicitacoes-content');
    if (!content) return;
    
    content.innerHTML = `
        <div class="alert alert-danger">
            <h4>Erro no Sistema de Solicitações</h4>
            <p>${error.message}</p>
            <div class="mt-3">
                <button class="btn btn-primary me-2" onclick="location.reload()">
                    <i class="fas fa-redo me-1"></i>Tentar Novamente
                </button>
                <button class="btn btn-outline-secondary" 
                        onclick="window.app ? window.app.loadPage('dashboard.html') : window.location.href='dashboard.html'">
                    <i class="fas fa-home me-1"></i>Voltar ao Dashboard
                </button>
            </div>
        </div>
    `;
}

// Se estiver carregando como página normal (não SPA)
if (!window.location.pathname.includes('app.html') && 
    !document.getElementById('app-content')) {
    
    console.log('🌐 Solicitações carregando como página normal...');
    document.addEventListener('DOMContentLoaded', async function() {
        // Carrega navbar primeiro
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('⚠️ Não foi possível carregar navbar:', e);
        }
        
        await initSolicitacoes();
    });
}

// Exportar função para SPA
export default initSolicitacoes;