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

// Google Drive API (DESATIVADO TEMPORARIAMENTE)
let gapiInicializada = false;
let CLIENT_ID = 'SEU_CLIENT_ID_AQUI'; // Substituir quando configurar
let API_KEY = 'SUA_API_KEY_AQUI'; // Substituir quando configurar
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
        
        // 5. Inicializar Google Drive API EM SEGUNDO PLANO (não bloqueante)
        inicializarGoogleDrive().then(success => {
            console.log(success ? '✅ Drive OK' : '⚠️ Drive não disponível');
        }).catch(() => {
            console.log('⚠️ Drive ignorado (não configurado)');
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
        // 1. Se for admin (nível 1), carrega TODAS as OPMs
        if (userDataCache.nivel === 1) {
            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);
            
            if (localSnapshot.exists()) {
                opmsPermitidas = Object.keys(localSnapshot.val());
                opmsNomes = localSnapshot.val();
            }
        } else {
            // 2. Para não-admins, carregar OPMs permitidas
            const permissaoRef = ref(database, `efetivo/${userRE}/permissaoOPM`);
            const permissaoSnapshot = await get(permissaoRef);
            
            if (permissaoSnapshot.exists()) {
                opmsPermitidas = Object.keys(permissaoSnapshot.val());
            }
            
            // 3. Carregar nomes das OPMs
            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);
            
            if (localSnapshot.exists()) {
                opmsNomes = localSnapshot.val();
            }
        }
        
        if (opmsPermitidas.length === 0) {
            throw new Error('Nenhuma OPM permitida para seu usuário');
        }
        
        // 4. Carregar composições das OPMs permitidas
        for (const opm of opmsPermitidas) {
            try {
                const opmRef = ref(database, `LocalOPM/${opm}`);
                const opmSnapshot = await get(opmRef);
                
                if (opmSnapshot.exists()) {
                    composicoesDisponiveis[opm] = {};
                    Object.entries(opmSnapshot.val()).forEach(([codigo, dados]) => {
                        composicoesDisponiveis[opm][codigo] = dados;
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Não foi possível carregar composições da OPM ${opm}:`, error);
            }
        }
        
        // 5. Definir mês e ano atual para filtro
        const hoje = new Date();
        mesFiltro = hoje.getMonth() + 1; // 1-12
        anoFiltro = hoje.getFullYear();
        
        // 6. Carregar solicitações do mês atual
        await carregarSolicitacoesMes();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        throw error;
    }
}

// NOVA FUNÇÃO: Extrair data do ID da solicitação - CORRIGIDA PARA FUSO HORÁRIO
function extrairDataDoId(idSolicitacao) {
    try {
        // ID tem formato: OPM(9) + Composição(var) + AAAAMMDD + HHMM
        // Extrair os últimos 12 dígitos: AAAAMMDDHHMM
        const ultimos12 = idSolicitacao.slice(-12);
        const ano = ultimos12.substring(0, 4);
        const mes = ultimos12.substring(4, 6);
        const dia = ultimos12.substring(6, 8);
        
        // CORREÇÃO: Criar data no fuso horário local (Brasil)
        // Usar UTC para evitar problemas de fuso horário
        const dataUTC = new Date(Date.UTC(ano, mes - 1, dia));
        
        // Converter para data local
        const dataLocal = new Date(dataUTC);
        dataLocal.setMinutes(dataLocal.getMinutes() + dataLocal.getTimezoneOffset());
        
        return {
            data: `${ano}-${mes}-${dia}`,
            data_local: dataLocal,
            ano: parseInt(ano),
            mes: parseInt(mes),
            dia: parseInt(dia)
        };
    } catch (error) {
        console.warn('Erro ao extrair data do ID:', idSolicitacao, error);
        return null;
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
        
        // Buscar todas solicitações
        const solicitacoesRef = ref(database, 'solicitacoes');
        const snapshot = await get(solicitacoesRef);
        
        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([id, dados]) => {
                try {
                    // Verificar se a solicitação pertence à OPM selecionada
                    const idOpm = id.substring(0, 9);
                    
                    if (idOpm === opmSelecionada) {
                        // Extrair data do ID
                        const dataInfo = extrairDataDoId(id);
                        
                        if (dataInfo) {
                            // Filtrar por mês e ano
                            if (dataInfo.mes === mesFiltro && dataInfo.ano === anoFiltro) {
                                // ====== ADICIONAR AQUI ======
                                // Verificar se tem id_sistema_local mas não tem status
                                if (dados.id_sistema_local && !dados.status) {
                                    // Atualizar automaticamente para status 1
                                    atualizarStatusParaAprovado(id);
                                    // Atualizar dados localmente também
                                    dados.status = 1;
                                }
                                // ====== FIM DA ADIÇÃO ======
                                
                                solicitacoesCache.push({
                                    id: id,
                                    ...dados,
                                    // Adicionar data extraída (para ordenação)
                                    data_extraida: dataInfo.data,
                                    data_local: dataInfo.data_local
                                });
                            }
                        } else {
                            // Fallback: usar data do objeto se disponível
                            if (dados.data) {
                                const dataObj = new Date(dados.data);
                                // CORREÇÃO: Ajustar fuso horário
                                const dataAjustada = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
                                if (dataAjustada.getMonth() + 1 === mesFiltro && 
                                    dataAjustada.getFullYear() === anoFiltro) {
                                    
                                    // ====== ADICIONAR AQUI ======
                                    // Verificar se tem id_sistema_local mas não tem status
                                    if (dados.id_sistema_local && !dados.status) {
                                        // Atualizar automaticamente para status 1
                                        atualizarStatusParaAprovado(id);
                                        // Atualizar dados localmente também
                                        dados.status = 1;
                                    }
                                    // ====== FIM DA ADIÇÃO ======
                                    
                                    solicitacoesCache.push({
                                        id: id,
                                        ...dados
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao processar solicitação ${id}:`, error);
                }
            });
            
            // Ordenar por data e horário
            solicitacoesCache.sort((a, b) => {
                try {
                    let dataA, dataB;
                    
                    if (a.data_local) {
                        dataA = a.data_local;
                    } else if (a.data_extraida) {
                        dataA = new Date(a.data_extraida);
                    } else {
                        dataA = new Date(a.data);
                    }
                    
                    if (b.data_local) {
                        dataB = b.data_local;
                    } else if (b.data_extraida) {
                        dataB = new Date(b.data_extraida);
                    } else {
                        dataB = new Date(b.data);
                    }
                    
                    // Ajustar fuso horário
                    dataA = new Date(dataA.getTime() - (dataA.getTimezoneOffset() * 60000));
                    dataB = new Date(dataB.getTime() - (dataB.getTimezoneOffset() * 60000));
                    
                    if (isNaN(dataA) || isNaN(dataB)) return 0;
                    
                    // Se mesma data, ordenar por horário
                    if (dataA.getTime() === dataB.getTime() && a.horario_inicial && b.horario_inicial) {
                        return a.horario_inicial.localeCompare(b.horario_inicial);
                    }
                    
                    return dataA - dataB;
                } catch (error) {
                    return 0;
                }
            });
        }
        
    } catch (error) {
        console.error('Erro ao carregar solicitações:', error);
        throw error;
    }
}

// Função para atualizar status para aprovado (1) quando há ID do sistema
async function atualizarStatusParaAprovado(id) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        await update(solicitacaoRef, {
            status: 1
        });
        
        // Adicionar histórico
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Status atualizado automaticamente para aprovado (tem ID do sistema)'
        });
        await update(historicoRef, entradaHistorico);
        
        console.log(`✅ Solicitação ${id} atualizada para status 1 (aprovado)`);
        
    } catch (error) {
        console.error(`Erro ao atualizar status da solicitação ${id}:`, error);
        // Não lançar o erro para não quebrar o carregamento
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
                                           min="00:00" max="23:55"
                                           step="300"> <!-- 5 minutos -->
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
                                                accept=".pdf" title="Apenas arquivos PDF">
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
        
        <!-- Parte 3: Tabela de Solicitações (LAYOUT MELHORADO) -->
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
                                    <tr class="text-center">
                                        <th width="90">AÇÕES</th>
                                        <th width="90">DATA</th>
                                        <th>COMPOSIÇÃO</th>
                                        <th width="70">COD</th>
                                        <th width="120">HORÁRIO</th>
                                        <th colspan="2" width="120" class="text-center">VAGAS SOLICITADAS</th>
                                        <th width="80" class="text-center">PRIOR.</th>
                                        <th width="80" class="text-center">STATUS</th>
                                        <th width="80">ID</th>
                                        <th width="140">PRAZO</th>
                                        <th colspan="2" width="120" class="text-center">ESCALADO</th>
                                        <th width="60"></th>
                                    </tr>
                                    <tr class="text-center small table-secondary">
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th width="60">Sub/Sgt</th>
                                        <th width="60">Cb/Sd</th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th width="60">Sub/Sgt</th>
                                        <th width="60">Cb/Sd</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="tbodySolicitacoes">
                                    <tr>
                                        <td colspan="14" class="text-center py-5">
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
    const inputHorarioInicial = document.getElementById('inputHorarioInicial');
    if (inputHorarioInicial) {
        inputHorarioInicial.addEventListener('change', calcularHorarioFinal);
    }
    
    // Atualizar dias do mês quando data mudar
    const inputData = document.getElementById('inputData');
    if (inputData) {
        inputData.addEventListener('change', atualizarDiasMes);
    }
    
    // Configurar step de 5 minutos no input de horário
    configurarInputHorario();
}

// Configurar input de horário para 5 minutos
function configurarInputHorario() {
    const input = document.getElementById('inputHorarioInicial');
    if (!input) return;
    
    // Garantir step de 5 minutos
    input.step = '300';
    
    // Adicionar validação para múltiplos de 5 minutos
    input.addEventListener('input', function() {
        if (this.value) {
            const [hours, minutes] = this.value.split(':');
            const mins = parseInt(minutes);
            if (mins % 5 !== 0) {
                // Arredondar para o múltiplo de 5 mais próximo
                const roundedMins = Math.round(mins / 5) * 5;
                this.value = `${hours.padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`;
            }
        }
    });
}

// Inicializar Google Drive API (NÃO BLOQUEANTE)
function inicializarGoogleDrive() {
    return new Promise((resolve) => {
        // Verificar se gapi está disponível
        if (window.gapi && window.gapi.load) {
            console.log('📱 Google Drive API disponível');
            
            // Configurar timeout para não travar
            const timeout = setTimeout(() => {
                console.log('⚠️ Google Drive timeout - continuando sem');
                gapiInicializada = false;
                resolve(false);
            }, 3000);
            
            gapi.load('client', () => {
                clearTimeout(timeout);
                
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
                    resolve(false);
                });
            });
        } else {
            console.log('📱 Google Drive não está disponível (ignorando)');
            gapiInicializada = false;
            resolve(false);
        }
    });
}

// Função para upload no Google Drive (com fallback)
async function uploadParaGoogleDrive(arquivo, nomeArquivo) {
    
    // Validar se é PDF
    if (!validarArquivoPDF(arquivo)) {
        throw new Error('Apenas arquivos PDF são permitidos');
    }

    // Se Google Drive não disponível, usar fallback imediatamente
    if (!gapiInicializada || !CLIENT_ID || CLIENT_ID === 'SEU_CLIENT_ID_AQUI') {
        console.log('📦 Usando fallback (Google Drive não configurado)');
        
        if (arquivo.size < 1000000) { // 1MB
            return await converterParaBase64(arquivo);
        } else {
            throw new Error('Arquivo muito grande. Configure o Google Drive para anexos maiores que 1MB.');
        }
    }
    
    try {
        const metadata = {
            name: nomeArquivo,
            mimeType: arquivo.type,
            parents: ['root']
        };
        
        const accessToken = gapi.auth.getToken();
        if (!accessToken) {
            throw new Error('Não autenticado no Google Drive');
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
            throw new Error('Erro no upload Google Drive');
        }
        
        const data = await response.json();
        return `https://drive.google.com/file/d/${data.id}/view`;
        
    } catch (error) {
        console.error('Erro no upload Google Drive:', error);
        
        // Fallback: Converter para Base64
        if (arquivo.size < 1000000) {
            console.log('📦 Usando fallback Base64 para arquivo pequeno');
            return await converterParaBase64(arquivo);
        } else {
            throw new Error(`Arquivo muito grande para fallback. Use um arquivo menor ou configure o Google Drive.`);
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

// Função para validar tipo de arquivo (apenas PDF)
function validarArquivoPDF(arquivo) {
    // Verificar extensão .pdf (case insensitive)
    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.pdf')) {
        return false;
    }
    
    // Verificar tipo MIME (opcional, mas mais seguro)
    const tiposPermitidos = ['application/pdf'];
    if (arquivo.type && !tiposPermitidos.includes(arquivo.type)) {
        // Alguns navegadores podem não reportar type corretamente
        console.warn('Tipo MIME não reconhecido como PDF:', arquivo.type);
        // Continuar mesmo assim, pois a extensão está correta
    }
    
    return true;
}

// Inicializar datepicker
function inicializarDatepicker() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    
    try {
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
    } catch (error) {
        console.warn('⚠️ Flatpickr não carregado:', error);
    }
}

// Calcular horário final (+8 horas)
function calcularHorarioFinal() {
    const inputInicial = document.getElementById('inputHorarioInicial');
    const inputFinal = document.getElementById('inputHorarioFinal');
    
    if (!inputInicial || !inputInicial.value) {
        if (inputFinal) inputFinal.value = '';
        return;
    }
    
    const [horas, minutos] = inputInicial.value.split(':').map(Number);
    let horasFinais = horas + 8;
    
    // Ajustar se passar das 24h
    if (horasFinais >= 24) {
        horasFinais -= 24;
    }
    
    // Arredondar minutos para múltiplo de 5
    const minutosArredondados = Math.round(minutos / 5) * 5;
    
    if (inputFinal) {
        inputFinal.value = `${horasFinais.toString().padStart(2, '0')}:${minutosArredondados.toString().padStart(2, '0')}`;
    }
    
    // Validar vistoria técnica após 19:00
    const prioridadeSelect = document.getElementById('selectPrioridade');
    if (prioridadeSelect) {
        const prioridade = prioridadeSelect.value;
        if (prioridade === 'vistoria_tecnica') {
            const horarioFinal = new Date();
            horarioFinal.setHours(horasFinais, minutosArredondados, 0, 0);
            const limite = new Date();
            limite.setHours(19, 0, 0, 0);
            
            if (horarioFinal > limite) {
                mostrarAlertaVistoriaTecnica().then(() => {
                    const inputMotivo = document.getElementById('inputMotivo');
                    if (inputMotivo) inputMotivo.focus();
                });
            }
        }
    }
}

// Atualizar dias do mês no formulário
function atualizarDiasMes() {
    const divDias = document.getElementById('divDiasMes');
    if (!divDias) return;
    
    // Obter data selecionada
    const inputData = document.getElementById('inputData');
    if (!inputData || !inputData.value) {
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
        const prioridadeSelect = document.getElementById('selectPrioridade');
        const prioridade = prioridadeSelect ? prioridadeSelect.value : '';
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
    const selectOpm = document.getElementById('selectOpm');
    if (selectOpm) {
        selectOpm.addEventListener('change', async (e) => {
            opmSelecionada = e.target.value;
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
            atualizarComposicoesDropdown();
        });
    }
    
    const selectMes = document.getElementById('selectMes');
    if (selectMes) {
        selectMes.addEventListener('change', (e) => {
            mesFiltro = parseInt(e.target.value);
        });
    }
    
    const selectAno = document.getElementById('selectAno');
    if (selectAno) {
        selectAno.addEventListener('change', (e) => {
            anoFiltro = parseInt(e.target.value);
        });
    }
    
    const btnAtualizarFiltro = document.getElementById('btnAtualizarFiltro');
    if (btnAtualizarFiltro) {
        btnAtualizarFiltro.addEventListener('click', async () => {
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
        });
    }
    
    // Formulário
    const formNovaSolicitacao = document.getElementById('formNovaSolicitacao');
    if (formNovaSolicitacao) {
        formNovaSolicitacao.addEventListener('submit', async (e) => {
            e.preventDefault();
            await cadastrarSolicitacao();
        });
    }
    
    const btnLimparForm = document.getElementById('btnLimparForm');
    if (btnLimparForm) {
        btnLimparForm.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
                limparFormulario();
            }
        });
    }
    
    // Exportar CSV (apenas admin)
    if (userDataCache.nivel === 1) {
        const btnExportarCSV = document.getElementById('btnExportarCSV');
        if (btnExportarCSV) {
            btnExportarCSV.addEventListener('click', exportarCSV);
        }
    }
    
    // Prioridade change
    const selectPrioridade = document.getElementById('selectPrioridade');
    if (selectPrioridade) {
        selectPrioridade.addEventListener('change', (e) => {
            atualizarCampoAnexo(e.target.value);
            atualizarDiasMes();
            calcularHorarioFinal();
        });
    }

    // Validação de PDF no input de anexo
    const inputAnexo = document.getElementById('inputAnexo');
    if (inputAnexo) {
        inputAnexo.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                const arquivo = this.files[0];
                if (!validarArquivoPDF(arquivo)) {
                    mostrarMensagemFormulario('❌ Apenas arquivos PDF são permitidos', 'danger');
                    this.value = ''; // Limpar input
                    
                    // Esconder div de anexo se não for prioridade que requer anexo
                    const prioridade = document.getElementById('selectPrioridade').value;
                    if (prioridade !== 'minimo_operacional' && prioridade !== 'vistoria_tecnica') {
                        document.getElementById('divAnexo').style.display = 'none';
                    }
                }
            }
        });
    }
}

// Atualizar campo anexo conforme prioridade
function atualizarCampoAnexo(prioridade) {
    const divAnexo = document.getElementById('divAnexo');
    const labelAnexo = document.getElementById('labelAnexo');
    const textoAjuda = document.getElementById('textoAjudaAnexo');
    
    if (!divAnexo || !labelAnexo || !textoAjuda) return;
    
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
        if (!btnCadastrar) return;
        
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
        if (inputAnexo && inputAnexo.files.length > 0) {
            try {
                const progressBar = document.getElementById('progressAnexo');
                const progressFill = progressBar ? progressBar.querySelector('.progress-bar') : null;
                
                if (progressBar) progressBar.style.display = 'block';
                if (progressFill) progressFill.style.width = '50%';
                
                // Gerar nome do arquivo
                const mesAno = formData.data_base.substring(0, 7).replace(/-/g, '');
                const baseNome = `${formData.opm_codigo}${formData.composicao_cod}${mesAno}`;
                const extensao = inputAnexo.files[0].name.substring(inputAnexo.files[0].name.lastIndexOf('.'));
                const nomeArquivo = `${baseNome}01${extensao}`;
                
                linkAnexo = await uploadParaGoogleDrive(inputAnexo.files[0], nomeArquivo);
                
                if (progressFill) progressFill.style.width = '100%';
                setTimeout(() => {
                    if (progressBar) progressBar.style.display = 'none';
                    if (progressFill) progressFill.style.width = '0%';
                }, 500);
                
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
            
            // Limpar formulário AUTOMATICAMENTE (sem confirmação)
            limparFormularioSilencioso();
            
            // Atualizar tabela IMEDIATAMENTE
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
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
        if (btnCadastrar) {
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = '<i class="fas fa-save me-1"></i>Cadastrar';
        }
    }
}

// Função para limpar formulário sem confirmação
function limparFormularioSilencioso() {
    const form = document.getElementById('formNovaSolicitacao');
    if (form) form.reset();
    
    const inputHorarioFinal = document.getElementById('inputHorarioFinal');
    if (inputHorarioFinal) inputHorarioFinal.value = '';
    
    const divDiasMes = document.getElementById('divDiasMes');
    if (divDiasMes) divDiasMes.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
    
    const divAnexo = document.getElementById('divAnexo');
    if (divAnexo) divAnexo.style.display = 'none';
}

// Coletar dados do formulário
function coletarDadosFormulario() {
    const dataInput = document.getElementById('inputData');
    if (!dataInput || !dataInput.value) {
        throw new Error('Data é obrigatória');
    }
    
    const [diaStr, mesStr, anoStr] = dataInput.value.split('/');
    const dataBase = `${anoStr}-${mesStr.padStart(2, '0')}-${diaStr.padStart(2, '0')}`;
    const diaSelecionado = parseInt(diaStr);
    
    // Dias selecionados (INCLUINDO o dia da data selecionada automaticamente)
    const diasSelecionados = [diaSelecionado]; // Começa com o dia selecionado
    
    // Adicionar outros dias marcados
    const checkboxes = document.querySelectorAll('#divDiasMes input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
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
        motivo: document.getElementById('inputMotivo')?.value.trim() || '',
        observacoes: document.getElementById('inputObservacoes')?.value.trim() || '',
        diasSelecionados: diasSelecionados,
        tem_anexo: document.getElementById('inputAnexo')?.files.length > 0
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
        const modalElement = document.getElementById('modalAlertaVistoria');
        if (!modalElement) return resolve();
        
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // Configurar botão
        const btnEntendi = document.getElementById('btnEntendiAlerta');
        if (btnEntendi) {
            btnEntendi.onclick = () => {
                modal.hide();
                setTimeout(() => {
                    modalContainer.remove();
                    resolve();
                }, 300);
            };
        }
        
        // Focar no campo motivo quando modal fechar
        modalElement.addEventListener('hidden.bs.modal', () => {
            const inputMotivo = document.getElementById('inputMotivo');
            if (inputMotivo) inputMotivo.focus();
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

// Cadastrar um dia específico da solicitação
async function cadastrarDiaSolicitacao(dados, dia, linkAnexo) {
    // Construir data completa
    const dataCompleta = `${dados.data_base.substring(0, 8)}${dia.toString().padStart(2, '0')}`;
    
    // Gerar ID único - FORMATO MELHORADO: OPM(9) + Composição(var) + AAAAMMDD + HHMM
    const idSolicitacao = `${dados.opm_codigo}${dados.composicao_cod}${dataCompleta.replace(/-/g, '')}${dados.horario_inicial.replace(/:/g, '')}`;
    
    // Obter nome da composição
    let composicaoNome = '';
    let descricao = '';
    if (composicoesDisponiveis[dados.opm_codigo] && composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod]) {
        composicaoNome = composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod].composicao || '';
        descricao = composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod].descricao || '';
    }
    
    // Dados para salvar
    const dadosSolicitacao = {
        data: dataCompleta,
        opm_codigo: dados.opm_codigo,
        opm_nome: dados.opm_nome,
        composicao_cod: dados.composicao_cod,
        composicao_nome: composicaoNome,
        descricao: descricao,
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
    const entradaHistorico = criarEntradaHistorico({
        dados_completos: 'Solicitação criada'
    });
    await update(historicoRef, entradaHistorico);
}

// NOVA FUNÇÃO para criar timestamp válido para Firebase
function criarTimestampFirebase() {
    const now = new Date();
    // Formato: YYYYMMDDHHMMSSmmm (sem caracteres especiais)
    return (
        now.getFullYear() + 
        String(now.getMonth() + 1).padStart(2, '0') + 
        String(now.getDate()).padStart(2, '0') + 
        String(now.getHours()).padStart(2, '0') + 
        String(now.getMinutes()).padStart(2, '0') + 
        String(now.getSeconds()).padStart(2, '0') + 
        String(now.getMilliseconds()).padStart(3, '0')
    );
}

// NOVA FUNÇÃO para criar objeto de histórico
function criarEntradaHistorico(dados = {}) {
    const timestamp = criarTimestampFirebase();
    return {
        [timestamp]: {
            alterado_por_re: userRE,
            alterado_por_nome: userDataCache.nome,
            ...dados
        }
    };
}

// Limpar formulário
function limparFormulario() {
    if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
        limparFormularioSilencioso();
        const mensagensDiv = document.getElementById('mensagensForm');
        if (mensagensDiv) mensagensDiv.innerHTML = '';
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

// Atualizar tabela de solicitações (LAYOUT MELHORADO)
async function atualizarTabelaSolicitacoes() {
    const tbody = document.getElementById('tbodySolicitacoes');
    const contador = document.getElementById('contadorSolicitacoes');
    
    if (!tbody || !contador) {
        console.error('Elementos da tabela não encontrados');
        return;
    }
    
    try {
        // Atualizar contador
        contador.textContent = solicitacoesCache.length;
        
        if (solicitacoesCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center py-4 text-muted">
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
            
            // Formatar data - CORREÇÃO DO FUSO HORÁRIO
            let dataFormatada;
            let dataObj;
            
            if (solicitacao.data_local) {
                dataObj = solicitacao.data_local;
            } else if (solicitacao.data_extraida) {
                dataObj = new Date(solicitacao.data_extraida);
                // Ajustar fuso horário
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            } else {
                dataObj = new Date(solicitacao.data);
                // Ajustar fuso horário
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            }
            
            if (isNaN(dataObj.getTime())) {
                dataFormatada = 'Data inválida';
            } else {
                // Formatar como DD/MM/AAAA
                const dia = dataObj.getDate().toString().padStart(2, '0');
                const mes = (dataObj.getMonth() + 1).toString().padStart(2, '0');
                const ano = dataObj.getFullYear();
                dataFormatada = `${dia}/${mes}/${ano}`;
            }
            
            // Status
            const statusIcon = getIconeStatus(solicitacao.status);
            const statusClass = getClasseStatus(solicitacao.status);
            
            // Prioridade (ícones mais destacados)
            const prioridadeIcon = getIconePrioridadeMelhorado(solicitacao.prioridade);
            
            // Ações (ícones) - REMOVIDO "Admin only"
            const acoesHTML = gerarAcoesHTMLMelhorado(solicitacao);
            
            // Vagas solicitadas (separadas)
            const vagasSubten = solicitacao.vagas_subten_sgt || 0;
            const vagasCbSd = solicitacao.vagas_cb_sd || 0;
            
            // Escalado (separado)
            const escaladoSubten = solicitacao.escalado_subten_sgt || 0;
            const escaladoCbSd = solicitacao.escalado_cb_sd || 0;
            
            // Classes para cores (vermelho se faltando)
            const subtenClass = (escaladoSubten < vagasSubten) ? 'text-danger fw-bold' : '';
            const cbSdClass = (escaladoCbSd < vagasCbSd) ? 'text-danger fw-bold' : '';
            
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
            
            // Linha da tabela (LAYOUT MELHORADO)
            html += `
                <tr class="${statusClass} align-middle text-center" id="linha-${solicitacao.id}">
                    <td class="py-2">${acoesHTML}</td>
                    <td class="py-2">
                        <a href="#" class="text-primary text-decoration-underline link-reutilizar" 
                        data-id="${solicitacao.id}" 
                        title="Clique para reutilizar estes dados em nova solicitação">
                        <strong>${dataFormatada}</strong>
                        </a>
                    </td>
                    <td class="py-2 text-start">${solicitacao.composicao_nome || ''}</td>
                    <td class="py-2"><code>${solicitacao.composicao_cod || ''}</code></td>
                    <td class="py-2">${solicitacao.horario_inicial || ''} às ${solicitacao.horario_final || ''}</td>
                    <td class="py-2">${vagasSubten}</td>
                    <td class="py-2">${vagasCbSd}</td>
                    <td class="py-2">${prioridadeIcon}</td>
                    <td class="py-2">
                        <span class="status-icon" data-id="${solicitacao.id}" 
                              data-status="${solicitacao.status || ''}" 
                              style="cursor: ${userDataCache.nivel === 1 ? 'pointer' : 'default'}; 
                                     font-size: 1.2em;">
                            ${statusIcon}
                        </span>
                    </td>
                    <td class="py-2"><small>${idSistema}</small></td>
                    <td class="py-2"><small>${prazoHTML}</small></td>
                    <td class="py-2 ${subtenClass}">${escaladoSubten}</td>
                    <td class="py-2 ${cbSdClass}">${escaladoCbSd}</td>
                    <td class="py-2">
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
        configurarReutilizacaoDados();
        
    } catch (error) {
        console.error('Erro ao atualizar tabela:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i><br>
                    Erro ao carregar solicitações<br>
                    <small>${error.message}</small>
                </td>
            </tr>
        `;
    }
}

// Gerar HTML das ações MELHORADO (separar botões)
function gerarAcoesHTMLMelhorado(solicitacao) {
    // Status 4 (em edição) - não mostra ações
    if (solicitacao.status === 4) {
        return ''; // Nada - admin precisa liberar
    }
    
    // Status 5 (excluído) - mostra botão para reativar (apenas admin)
    if (solicitacao.status === 5) {
        return userDataCache.nivel === 1 ? `
            <button class="btn btn-sm btn-success btn-reativar" data-id="${solicitacao.id}" title="Reativar">
                <i class="fas fa-undo"></i>
            </button>
        ` : '';
    }
    
    // Status 1, 2, 3 ou vazio - verificar permissão
    const podeEditar = (
        userDataCache.nivel === 1 || // Admin (qualquer OPM)
        (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo))
    );
    
    if (!podeEditar) {
        return ''; // Nada
    }
    
    return `
        <div class="d-flex gap-1 justify-content-center">
            <button class="btn btn-sm btn-outline-primary btn-editar" data-id="${solicitacao.id}" title="Editar">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-excluir" data-id="${solicitacao.id}" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
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
                if (status === '4') { // ⬅️ APENAS se estiver em edição (status 4)
                    liberarParaEdicao(id);
                }
            });
        });
    }
    
    // Ações normais (níveis 1 e 2 podem ver/editar)
    if (userDataCache.nivel <= 2) {
        // Editar (lápis) - AGORA só transforma em inputs
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                iniciarEdicao(id); // ⬅️ Só transforma células em inputs
            });
        });
        
        // Excluir (lixeira) - funciona normal
        document.querySelectorAll('.btn-excluir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                excluirSolicitacao(id);
            });
        });
        
        // Atualizar (durante edição) - AGORA salva e muda status
        document.querySelectorAll('.btn-atualizar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                confirmarEdicao(id); // ⬅️ Salva e muda status para 4
            });
        });
        
        // Cancelar edição (X) - AGORA só reverte visualmente
        document.querySelectorAll('.btn-cancelar-edicao').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                cancelarEdicao(id); // ⬅️ Só reverte visualmente
            });
        });
    }
    
    // Reativar (apenas admin) - para status 5
    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.btn-reativar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                reativarSolicitacao(id);
            });
        });
    }
    
    // Links para reutilizar dados
    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            reutilizarDadosSolicitacao(id);
        });
    });
}

// Função para reutilizar dados de uma solicitação existente
function configurarReutilizacaoDados() {
    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            await reutilizarDadosSolicitacao(id);
        });
    });
}

async function reutilizarDadosSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) {
        mostrarMensagemFormulario('❌ Solicitação não encontrada', 'danger');
        return;
    }
    
    try {
        // Preencher formulário com dados da solicitação
        document.getElementById('selectComposicao').value = solicitacao.composicao_cod;
        document.getElementById('inputHorarioInicial').value = solicitacao.horario_inicial;
        document.getElementById('selectPrioridade').value = solicitacao.prioridade;
        document.getElementById('inputVagasSubten').value = solicitacao.vagas_subten_sgt;
        document.getElementById('inputVagasCbSd').value = solicitacao.vagas_cb_sd;
        document.getElementById('inputMotivo').value = solicitacao.motivo || '';
        document.getElementById('inputObservacoes').value = solicitacao.observacoes || '';
        
        // Calcular horário final
        calcularHorarioFinal();
        
        // Atualizar campo anexo conforme prioridade
        atualizarCampoAnexo(solicitacao.prioridade);
        
        // Rolar até o formulário
        document.getElementById('formNovaSolicitacao').scrollIntoView({ behavior: 'smooth' });
        
        // Mostrar mensagem
        mostrarMensagemFormulario('✅ Dados carregados! Agora selecione uma nova data.', 'success');
        
    } catch (error) {
        console.error('Erro ao reutilizar dados:', error);
        mostrarMensagemFormulario('❌ Erro ao carregar dados', 'danger');
    }
}

// Obter ícone do status
function getIconeStatus(status) {
    switch(status) {
        case 1: return '<i class="fas fa-check-circle text-success"></i>'; // ✅
        case 2: return '<i class="fas fa-exclamation-triangle text-warning"></i>'; // ⚠️
        case 3: return '<i class="fas fa-times-circle text-danger"></i>'; // ❌
        case 4: return '<i class="fas fa-hand-paper text-warning"></i>'; // ✋
        case 5: return '<i class="fas fa-trash-alt text-secondary"></i>'; // 🗑️
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

// Obter ícone da prioridade MELHORADO (mais destacado)
function getIconePrioridadeMelhorado(prioridade) {
    switch(prioridade) {
        case 'minimo_operacional':
            return '<span class="badge bg-success"><i class="fas fa-shield-alt me-1"></i>Mínimo</span>';
        case 'vistoria_tecnica':
            return '<span class="badge bg-warning text-dark"><i class="fas fa-clipboard-check me-1"></i>Vistoria</span>';
        case 'viatura_extra':
            return '<span class="badge bg-info"><i class="fas fa-car me-1"></i>Extra</span>';
        default:
            return '<span class="badge bg-secondary"><i class="fas fa-minus"></i></span>';
    }
}

// Mostrar detalhes da solicitação (COM CORREÇÃO PARA BASE64)
async function mostrarDetalhesSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;
    
    // Tratar anexo base64
    let anexoHTML = '';
    if (solicitacao.comprovante_url) {
        if (solicitacao.comprovante_url.startsWith('data:')) {
            // É base64 - criar link para download
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo:</strong></label>
                    <div>
                        <a href="#" class="btn btn-sm btn-outline-primary" id="btnDownloadBase64${id}">
                            <i class="fas fa-download me-1"></i>Baixar anexo
                        </a>
                        <small class="text-muted ms-2">(formato base64)</small>
                    </div>
                </div>
            `;
        } else {
            // É URL normal
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo:</strong></label>
                    <div>
                        <a href="${solicitacao.comprovante_url}" target="_blank" class="btn btn-sm btn-outline-primary">
                            <i class="fas fa-external-link-alt me-1"></i>Abrir anexo
                        </a>
                    </div>
                </div>
            `;
        }
    } else {
        anexoHTML = '<small class="text-muted">Nenhum anexo</small>';
    }
    
    // Criar modal dinâmico
    const modalHTML = `
        <div class="modal fade" id="modalDetalhes${id}" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-info-circle me-2"></i>
                            Detalhes da Solicitação
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Data:</strong> ${new Date(solicitacao.data).toLocaleDateString('pt-BR')}<br>
                                <strong>Horário:</strong> ${solicitacao.horario_inicial} às ${solicitacao.horario_final}<br>
                                <strong>OPM:</strong> ${solicitacao.opm_nome} (${solicitacao.opm_codigo})<br>
                                <strong>Composição:</strong> ${solicitacao.composicao_nome} (${solicitacao.composicao_cod})
                            </div>
                            <div class="col-md-6">
                                <strong>Vagas:</strong> ${solicitacao.vagas_subten_sgt} Subten/Sgt, ${solicitacao.vagas_cb_sd} Cb/Sd<br>
                                <strong>Prioridade:</strong> ${solicitacao.prioridade}<br>
                                <strong>Criado por:</strong> ${solicitacao.criado_por_nome}<br>
                                <strong>Criado em:</strong> ${new Date(solicitacao.criado_em).toLocaleString('pt-BR')}
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label"><strong>Motivo:</strong></label>
                            <textarea class="form-control" id="modalMotivo${id}" rows="2">${solicitacao.motivo || ''}</textarea>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label"><strong>Observações:</strong></label>
                            <textarea class="form-control" id="modalObservacoes${id}" rows="2">${solicitacao.observacoes || ''}</textarea>
                        </div>
                        
                        ${anexoHTML}
                        
                        ${userDataCache.nivel === 1 ? `
                        <div class="mb-3">
                            <label class="form-label"><strong>Administração:</strong></label>
                            <textarea class="form-control" id="modalAdministracao${id}" rows="2">${solicitacao.administracao || ''}</textarea>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarDetalhes${id}">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar ao DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    // Configurar botão salvar
    const btnSalvar = document.getElementById(`btnSalvarDetalhes${id}`);
    if (btnSalvar) {
        btnSalvar.onclick = () => salvarDetalhesSolicitacao(id, modalContainer);
    }
    
    // Configurar download de base64 se existir
    if (solicitacao.comprovante_url && solicitacao.comprovante_url.startsWith('data:')) {
        const btnDownload = document.getElementById(`btnDownloadBase64${id}`);
        if (btnDownload) {
            btnDownload.onclick = (e) => {
                e.preventDefault();
                downloadBase64(solicitacao.comprovante_url, `anexo_${id}.pdf`);
            };
        }
    }
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById(`modalDetalhes${id}`));
    modal.show();
    
    // Remover modal do DOM quando fechar
    const modalElement = document.getElementById(`modalDetalhes${id}`);
    modalElement.addEventListener('hidden.bs.modal', () => {
        setTimeout(() => modalContainer.remove(), 300);
    });
}

// Função para download de base64
function downloadBase64(base64Data, filename) {
    try {
        // Extrair o tipo MIME e os dados
        const parts = base64Data.split(';base64,');
        const mimeType = parts[0].split(':')[1];
        const data = parts[1];
        
        // Converter base64 para blob
        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: mimeType});
        
        // Criar link de download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Erro ao fazer download:', error);
        mostrarMensagemFormulario('❌ Erro ao fazer download do anexo', 'danger');
    }
}

// Salvar detalhes da solicitação
async function salvarDetalhesSolicitacao(id, modalContainer) {
    try {
        const solicitacao = solicitacoesCache.find(s => s.id === id);
        if (!solicitacao) return;
        
        // Verificar permissão
        const podeEditar = (
            userDataCache.nivel === 1 || // Admin
            (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo))
        );
        
        if (!podeEditar) {
            mostrarMensagemFormulario('❌ Você não tem permissão para editar esta solicitação', 'danger');
            return;
        }
        
        const motivo = document.getElementById(`modalMotivo${id}`).value;
        const observacoes = document.getElementById(`modalObservacoes${id}`).value;
        
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Se não está em edição (status 4), mudar para status 4
        if (!solicitacao.status || solicitacao.status !== 4) {
            // Salvar dados anteriores no histórico
            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                motivo_anterior: solicitacao.motivo || '',
                observacoes_anteriores: solicitacao.observacoes || ''
            });
            await update(historicoRef, entradaHistorico);
            
            // Mudar para status 4
            await update(solicitacaoRef, {
                status: 4,
                motivo: motivo,
                observacoes: observacoes
            });
            
            mostrarMensagemFormulario('✋ Detalhes atualizados. Solicitação em modo de edição.', 'info');
            
        } else {
            // Já está em edição, apenas atualizar
            const updates = {
                motivo: motivo,
                observacoes: observacoes
            };
            
            // Se for admin, salvar também o campo administração
            if (userDataCache.nivel === 1) {
                const administracao = document.getElementById(`modalAdministracao${id}`).value;
                updates.administracao = administracao;
            }
            
            // Atualizar no Firebase (mantém status 4)
            await update(solicitacaoRef, updates);
            
            // Adicionar histórico
            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                campos_alterados: Object.keys(updates)
            });
            await update(historicoRef, entradaHistorico);
            
            mostrarMensagemFormulario('✅ Detalhes atualizados! Solicitação continua em edição.', 'success');
        }
        
        // Atualizar cache local
        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].motivo = motivo;
            solicitacoesCache[index].observacoes = observacoes;
            if (userDataCache.nivel === 1) {
                solicitacoesCache[index].administracao = document.getElementById(`modalAdministracao${id}`).value;
            }
        }
        
        // Fechar modal
        bootstrap.Modal.getInstance(document.getElementById(`modalDetalhes${id}`)).hide();
        
        // Atualizar tabela (vai mostrar status 4 - mão)
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
    } catch (error) {
        console.error('Erro ao salvar detalhes:', error);
        mostrarMensagemFormulario('❌ Erro ao salvar detalhes', 'danger');
    }
}

// Iniciar edição de solicitação
async function iniciarEdicao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;
    
    // Verificar permissão
    const podeEditar = (
        userDataCache.nivel === 1 || // Admin
        (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo))
    );
    
    if (!podeEditar) {
        mostrarMensagemFormulario('❌ Você não tem permissão para editar esta solicitação', 'danger');
        return;
    }
    
    try {
        // Transformar células de vagas em inputs
        transformarCelulasEmInputs(id, solicitacao);
        
        // Atualizar botões (mostrar "atualizar" e "cancelar")
        atualizarBotoesParaModoEdicao(id);
        
        mostrarMensagemFormulario('✋ Editando solicitação - Clique em "Atualizar" para confirmar', 'info');
        
    } catch (error) {
        console.error('Erro ao iniciar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao iniciar edição', 'danger');
    }
}

function transformarCelulasEmInputs(id, solicitacao) {
    const linha = document.getElementById(`linha-${id}`);
    if (!linha) return;
    
    // Célula de vagas Subten/Sgt (coluna 5 - índice 5)
    const celulaSubten = linha.cells[5];
    celulaSubten.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center" 
               id="editSubten${id}" 
               value="${solicitacao.vagas_subten_sgt || 0}"
               min="0" max="99" style="width: 60px;">
    `;
    
    // Célula de vagas Cb/Sd (coluna 6 - índice 6)
    const celulaCbSd = linha.cells[6];
    celulaCbSd.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center" 
               id="editCbSd${id}" 
               value="${solicitacao.vagas_cb_sd || 0}"
               min="0" max="99" style="width: 60px;">
    `;
}

// Confirmar edição
async function confirmarEdicao(id) {
    try {
        // Obter valores dos inputs
        const inputSubten = document.getElementById(`editSubten${id}`);
        const inputCbSd = document.getElementById(`editCbSd${id}`);
        
        if (!inputSubten || !inputCbSd) {
            throw new Error('Não foi possível encontrar os campos de edição');
        }
        
        const novasVagasSubten = parseInt(inputSubten.value) || 0;
        const novasVagasCbSd = parseInt(inputCbSd.value) || 0;
        
        if (novasVagasSubten < 0 || novasVagasCbSd < 0) {
            mostrarMensagemFormulario('❌ As vagas não podem ser negativas', 'danger');
            return;
        }
        
        // Buscar dados atuais ANTES de atualizar (para histórico)
        const solicitacaoAtual = solicitacoesCache.find(s => s.id === id);
        if (!solicitacaoAtual) return;
        
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // 1. Criar histórico com dados ANTES da atualização
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            vagas_anteriores: {
                subten_sgt: solicitacaoAtual.vagas_subten_sgt,
                cb_sd: solicitacaoAtual.vagas_cb_sd
            },
        });
        await update(historicoRef, entradaHistorico);
        
        // 2. Atualizar vagas E mudar status para 4
        await update(solicitacaoRef, {
            vagas_subten_sgt: novasVagasSubten,
            vagas_cb_sd: novasVagasCbSd,
            status: 4  // ⬅️ AGORA muda status aqui
        });
        
        // 3. Atualizar cache local
        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].vagas_subten_sgt = novasVagasSubten;
            solicitacoesCache[index].vagas_cb_sd = novasVagasCbSd;
            solicitacoesCache[index].status = 4;
        }
        
        // 4. Atualizar tabela COMPLETA (volta botões originais)
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('✅ Vagas atualizadas! Solicitação agora está em modo de edição (status 4).', 'success');
        
    } catch (error) {
        console.error('Erro ao confirmar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao atualizar vagas', 'danger');
    }
}

// Cancelar edição
async function cancelarEdicao(id) {
    try {
        // Não atualiza Firebase, apenas reverte visualmente
        // Atualizar tabela (carrega dados originais)
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        mostrarMensagemFormulario('Edição cancelada - Nenhuma alteração foi salva', 'info');
        
    } catch (error) {
        console.error('Erro ao cancelar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao cancelar edição', 'danger');
    }
}

// Excluir solicitação
async function excluirSolicitacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta solicitação?\n\nAtenção: Esta ação pode ser revertida apenas por um administrador.')) return;
    
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Atualizar status para 5 (excluído)
        await update(solicitacaoRef, {
            status: 5
        });
        
        // Adicionar histórico
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico();
        await update(historicoRef, entradaHistorico);
        
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
            status: null
        });
        
        // Adicionar histórico
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico();
        await update(historicoRef, entradaHistorico);
        
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
    // Criar modal dinâmico
    const modalHTML = `
        <div class="modal fade" id="modalLiberarEdicao${id}" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-unlock me-2"></i>
                            Liberar para Edição
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Tem certeza que deseja liberar esta solicitação para edição?</p>
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            A solicitação será desbloqueada e poderá ser editada pelo usuário que a criou.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-warning" id="btnConfirmarLiberar${id}">Liberar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar ao DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
    
    // Configurar botão confirmar
    const btnConfirmar = document.getElementById(`btnConfirmarLiberar${id}`);
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarLiberacao(id, modalContainer);
    }
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById(`modalLiberarEdicao${id}`));
    modal.show();
    
    // Remover modal do DOM quando fechar
    const modalElement = document.getElementById(`modalLiberarEdicao${id}`);
    modalElement.addEventListener('hidden.bs.modal', () => {
        setTimeout(() => modalContainer.remove(), 300);
    });
}

// Confirmar liberação (admin)
async function confirmarLiberacao(id, modalContainer) {
    try {
        const solicitacaoRef = ref(database, `solicitacoes/${id}`);
        
        // Remover status (volta para vazio/null)
        await update(solicitacaoRef, {
            status: null
        });
        
        // Adicionar histórico
        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Liberado pelo administrador para edição'
        });
        await update(historicoRef, entradaHistorico);
        
        // Atualizar cache e tabela
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        
        // Fechar modal
        bootstrap.Modal.getInstance(document.getElementById(`modalLiberarEdicao${id}`)).hide();
        
        mostrarMensagemFormulario('🔓 Solicitação liberada para edição', 'success');
        
    } catch (error) {
        console.error('Erro ao liberar:', error);
        mostrarMensagemFormulario('❌ Erro ao liberar solicitação', 'danger');
    }
}

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
        
        if (!confirm(`Exportar ${paraExportar.length} solicitações?\n\nApós exportar, as solicitações serão bloqueadas para edição.`)) {
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
            Descricao: s.descricao || '',
            Horario_Inicial: s.horario_inicial,
            Horario_Final: s.horario_final,
            Vagas_Subten_Sgt: s.vagas_subten_sgt,
            Vagas_Cb_Sd: s.vagas_cb_sd,
            Prioridade: s.prioridade,
            Motivo: s.motivo || '',
            Observacoes: s.observacoes || '',
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
                status: 2
            });
            
            // Adicionar histórico
            const historicoRef = ref(database, `solicitacoes/${solicitacao.id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                exportado_por_re: userRE,
                exportado_por_nome: userDataCache.nome
            });
            await update(historicoRef, entradaHistorico);
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

// Função para converter data do Excel (DD/MM/YY HH:mm) para ISO
function converterDataExcelParaISO(dataExcel) {
    if (!dataExcel) return null;
    
    try {
        // Formato: "06/02/26 13:09"
        const [dataPart, horaPart] = dataExcel.split(' ');
        const [dia, mes, ano] = dataPart.split('/');
        const [hora, minuto] = horaPart.split(':');
        
        // Ano com 4 dígitos (assume 2000+)
        const anoCompleto = parseInt(ano) + 2000;
        
        // Criar data em UTC
        const dataUTC = new Date(Date.UTC(
            anoCompleto, 
            parseInt(mes) - 1, 
            parseInt(dia), 
            parseInt(hora), 
            parseInt(minuto)
        ));
        
        return dataUTC.toISOString();
    } catch (error) {
        console.error('Erro ao converter data Excel:', dataExcel, error);
        return null;
    }
}

function atualizarBotoesParaModoEdicao(id) {
    const linha = document.getElementById(`linha-${id}`);
    if (!linha) return;
    
    // Substituir botões "lápis" e "lixeira" por "atualizar" e "cancelar"
    const celulaAcoes = linha.cells[0];
    celulaAcoes.innerHTML = `
        <div class="d-flex gap-1 justify-content-center">
            <button class="btn btn-sm btn-warning btn-atualizar" data-id="${id}" title="Atualizar">
                <i class="fas fa-redo"></i>
            </button>
            <button class="btn btn-sm btn-secondary btn-cancelar-edicao" data-id="${id}" title="Cancelar">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Re-adicionar event listeners ESPECÍFICOS para esta linha
    const btnAtualizar = linha.querySelector('.btn-atualizar');
    const btnCancelar = linha.querySelector('.btn-cancelar-edicao');
    
    if (btnAtualizar) {
        btnAtualizar.onclick = () => confirmarEdicao(id);
    }
    
    if (btnCancelar) {
        btnCancelar.onclick = () => cancelarEdicao(id);
    }
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