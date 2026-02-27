import { database } from './firebase-config.js';
import { checkAuth } from './auth-check.js';
import { ref, get, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// ==================== VARIÁVEIS GLOBAIS ====================
let allEscalas = [];
let filteredEscalas = [];
let currentPage = 1;
const itemsPerPage = 15;
let uniqueStations = new Set();
let userNivel = 3;
let userRE = '';
let confirmacoesCache = {};

// Cache para dias já carregados
let loadedDaysCache = new Set(); // Formato: "YYYY-MM-DD"

// ==================== HIERARQUIA DE POSTOS/GRADUAÇÕES ====================
const HIERARQUIA_POSTOS = {
    'CORONEL PM': 1,
    'TENENTE CORONEL PM': 2,
    'MAJOR PM': 3,
    'CAPITAO PM': 4,
    '1. TENENTE PM': 5,
    '2. TENENTE PM': 6,
    'SUBTENENTE PM': 7,
    '1. SARGENTO PM': 8,
    '2. SARGENTO PM': 9,
    '3. SARGENTO PM': 10,
    'CABO PM': 11,
    'SOLDADO PM': 12,
    'SOLDADO PM 2. CLASSE': 13
};

// ==================== CONTROLE DE DATAS CARREGADAS ====================
let currentYear = null;
let currentMonth = null;
let currentDay = null;

// ==================== VARIÁVEL DE TIPO DE BUSCA ====================
let currentSearchType = 'RE';

// ==================== CACHE DE ESTAÇÕES ====================
let stationsCache = {};

// ==================== TIMEOUT PARA DEBOUNCE ====================
let filterTimeoutId = null;

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================
export async function initEscalasSPA() {
    await initializeApp();
}

async function initEscalas() {
    await initializeApp();
    await loadNavbar();
}

async function initializeApp() {
    try {
        const { userData, re } = await checkAuth(3);
        
        userRE = re;
        userNivel = userData.nivel || 3;
        
        sessionStorage.setItem('userRE', userRE);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userNivel', userNivel);
        
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        createModalIfNotExists();
        
        // ✅ 1. POPULAR FILTROS
        await populateFilters();
        
        // ✅ 2. CONFIGURAR EVENTOS
        setupEventListeners();
        
        // ✅ 3. CARREGAR DATA ATUAL (se houver)
        await loadTodayIfExists();
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        showError('Erro ao carregar: ' + error.message);
    }
}

// ==================== POPULAÇÃO DE FILTROS ====================

async function populateFilters() {
    // ✅ DIAS: Sempre 1-31
    populateDayFilter();
    
    // ✅ MESES: Sempre Janeiro-Dezembro
    populateMonthFilter();
    
    // ✅ ANOS: Agora gera localmente (2024 até ano atual + 1)
    populateYearFilterLocal();
    
    // ✅ ESTAÇÕES: Carrega do nó '/local' (apenas uma vez)
    await populateStationFilter();
}

// ✅ DIAS: Sempre 1-31
function populateDayFilter() {
    const dayFilter = document.getElementById('filterDay');
    if (!dayFilter) return;
    
    const currentValue = dayFilter.value;
    
    while (dayFilter.options.length > 1) {
        dayFilter.remove(1);
    }
    
    // Adicionar dias 1-31
    for (let day = 1; day <= 31; day++) {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = day.toString().padStart(2, '0');
        dayFilter.appendChild(option);
    }
    
    if (currentValue) {
        dayFilter.value = currentValue;
    }
}

// ✅ MESES: Sempre Janeiro-Dezembro
function populateMonthFilter() {
    const monthFilter = document.getElementById('filterMonth');
    if (!monthFilter) return;
    
    const currentValue = monthFilter.value;
    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    while (monthFilter.options.length > 1) {
        monthFilter.remove(1);
    }
    
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = monthNames[i - 1];
        monthFilter.appendChild(option);
    }
    
    if (currentValue) {
        monthFilter.value = currentValue;
    }
}

// ✅ ANOS: Gerado localmente (0 bytes do Firebase!)
function populateYearFilterLocal() {
    const yearFilter = document.getElementById('filterYear');
    if (!yearFilter) return;
    
    const currentValue = yearFilter.value;
    const currentYear = new Date().getFullYear();
    const startYear = 2024;
    const endYear = currentYear + 1;
    
    while (yearFilter.options.length > 1) {
        yearFilter.remove(1);
    }
    
    // Adicionar anos do mais recente para o mais antigo
    for (let year = endYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    }
    
    // Selecionar ano atual por padrão
    if (!currentValue) {
        yearFilter.value = currentYear;
    } else {
        try { yearFilter.value = currentValue; } catch (e) {}
    }
    
    console.log(`✅ Anos ${startYear}-${endYear} adicionados localmente`);
}

// ✅ ESTAÇÕES: Carrega do nó '/local'
async function populateStationFilter() {
    const stationFilter = document.getElementById('filterStation');
    if (!stationFilter) return;
    
    const currentValue = stationFilter.value;
    
    while (stationFilter.options.length > 1) {
        stationFilter.remove(1);
    }
    
    try {
        const localRef = ref(database, 'local');
        const snapshot = await get(localRef);
        
        if (snapshot.exists()) {
            stationsCache = snapshot.val();
            
            const sortedStations = Object.entries(stationsCache)
                .sort(([, nomeA], [, nomeB]) => nomeA.localeCompare(nomeB));
            
            sortedStations.forEach(([codigo, nome]) => {
                const option = document.createElement('option');
                option.value = nome;
                option.textContent = nome;
                stationFilter.appendChild(option);
            });
            
            console.log(`✅ ${sortedStations.length} estações carregadas`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar estações:', error);
    }
    
    if (currentValue) {
        try { stationFilter.value = currentValue; } catch (e) {}
    }
}

// ==================== FUNÇÃO PARA CARREGAR HOJE ====================

async function loadTodayIfExists() {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    // Verificar se hoje existe sem carregar todos os dados
    const exists = await checkIfDayExists(year, month, day);
    
    if (exists) {
        // Se existe, carregar normalmente
        await loadPeriod(year, month, day);
    } else {
        // Se não existe, apenas atualizar os filtros com a data de hoje
        const dayFilter = document.getElementById('filterDay');
        const monthFilter = document.getElementById('filterMonth');
        const yearFilter = document.getElementById('filterYear');
        
        if (dayFilter) dayFilter.value = day;
        if (monthFilter) monthFilter.value = month;
        if (yearFilter) yearFilter.value = year;
        
        // Mostrar mensagem informativa
        showMessage('Não há escalas para hoje. Selecione uma data com escalas.', 'info');
        
        // Tabela vazia
        allEscalas = [];
        filteredEscalas = [];
        renderTable();
        updateStatistics();
    }
}

// ✅ Verifica se um dia existe SEM carregar os dados completos
async function checkIfDayExists(year, month, day) {
    try {
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        const path = `escalados/${year}/${monthStr}/${dayStr}`;
        
        const dayRef = ref(database, path);
        const snapshot = await get(dayRef);
        
        return snapshot.exists();
        
    } catch (error) {
        console.error('❌ Erro ao verificar dia:', error);
        return false;
    }
}

// ==================== CARREGAMENTO DE DADOS ====================

// ✅ Carrega apenas UM DIA específico
async function loadEscalasByDate(year, month, day) {
    const cacheKey = `${year}-${month}-${day}`;
    
    // Se já carregou este dia, usar cache
    if (loadedDaysCache.has(cacheKey)) {
        console.log(`📦 Usando cache para ${cacheKey}`);
        // Filtrar apenas as escalas deste dia
        filteredEscalas = allEscalas.filter(e => 
            e.ano === year && e.mês === month && e.dia === day
        );
        return filteredEscalas.length > 0;
    }
    
    try {
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        const path = `escalados/${year}/${monthStr}/${dayStr}`;
        
        console.log(`🔍 Carregando APENAS o dia: ${path}`);
        
        const escalasRef = ref(database, path);
        const snapshot = await get(escalasRef);
        
        // Marcar como carregado (mesmo sem dados, para evitar buscas repetidas)
        loadedDaysCache.add(cacheKey);
        
        if (snapshot.exists()) {
            // Remover escalas antigas do mesmo dia
            allEscalas = allEscalas.filter(e => 
                !(e.ano === year && e.mês === month && e.dia === day)
            );
            
            // Processar novas escalas
            snapshot.forEach((escalaSnapshot) => {
                const escalaKey = escalaSnapshot.key;
                const escalaData = escalaSnapshot.val();
                processarEscala(escalaData, year, month, day, escalaKey);
            });
            
            // Ordenar todas as escalas
            sortAllEscalas();
            
            // Filtrar apenas o dia atual
            filteredEscalas = allEscalas.filter(e => 
                e.ano === year && e.mês === month && e.dia === day
            );
            
            console.log(`✅ ${filteredEscalas.length} escalas carregadas para ${day}/${month}/${year}`);
            return filteredEscalas.length > 0;
        }
        
        console.log(`ℹ️ Nenhuma escala encontrada em ${day}/${month}/${year}`);
        filteredEscalas = [];
        return false;
        
    } catch (error) {
        console.error(`❌ Erro ao carregar ${year}/${month}/${day}:`, error);
        return false;
    }
}

// ✅ FUNÇÃO PRINCIPAL - Só carrega se tiver DIA!
window.loadPeriod = async function(year, month, day = null) {
    // 🚨 Se não tiver dia, NÃO carrega dados e limpa tabela
    if (!day) {
        console.log('⚠️ Nenhum dia selecionado. Limpando tabela...');
        filteredEscalas = [];
        currentYear = year;
        currentMonth = month;
        currentDay = null;
        currentPage = 1;
        renderTable();
        updateStatistics();
        showMessage('Selecione um dia para visualizar as escalas.', 'info');
        
        // ✅ ESCONDER LOADING SE NÃO TEM DIA
        showLoading(false);
        return;
    }
    
    showLoading(true);
    
    try {
        const hasData = await loadEscalasByDate(year, month, day);
        
        if (hasData) {
            currentYear = year;
            currentMonth = month;
            currentDay = day;
            
            // Carregar confirmações APENAS para as escalas da página atual
            await loadConfirmacoesForCurrentPage();
            
            currentPage = 1;
            renderTable();
            updateStatistics();
            showMessage('Dia carregado com sucesso!', 'success');
        } else {
            allEscalas = allEscalas.filter(e => 
                !(e.ano === year && e.mês === month && e.dia === day)
            );
            filteredEscalas = [];
            currentYear = year;
            currentMonth = month;
            currentDay = day;
            currentPage = 1;
            renderTable();
            updateStatistics();
            showMessage('Nenhuma escala encontrada para este dia.', 'info');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar período:', error);
        showError('Erro ao carregar período: ' + error.message);
    } finally {
        // ✅ ESCONDER LOADING APÓS CARREGAR (SUCESSO OU ERRO)
        showLoading(false);
    }
};

// ✅ Botão "Hoje"
window.applyTodayFilter = async function() {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    const dayFilter = document.getElementById('filterDay');
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    const stationFilter = document.getElementById('filterStation');
    
    if (dayFilter) dayFilter.value = day;
    if (monthFilter) monthFilter.value = month;
    if (yearFilter) yearFilter.value = year;
    if (stationFilter) stationFilter.value = '';
    
    await window.loadPeriod(year, month, day);
};

// ==================== PROCESSAMENTO DE ESCALAS ====================

function processarEscala(escalaData, year, month, day, escalaKey) {
    if (escalaData.Exclusao === "X" || escalaData.Exclusao === "x") {
        return;
    }
    
    const escalaId = escalaData.Id || '';
    const escalaRE = escalaData.RE || '';
    
    const escala = {
        ...escalaData,
        escalaKey: escalaKey,
        ano: parseInt(year),
        mês: parseInt(month),
        dia: parseInt(day),
        Data: `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`,
        Id: escalaId,
        RE: escalaRE,
        linhaId: `${year}/${month}/${day}/${escalaKey}`
    };
    
    if (escalaData.HorarioInic !== undefined) {
        escala.horarioInicio = decimalToTime(escalaData.HorarioInic);
    }
    if (escalaData.HorarioTerm !== undefined) {
        escala.horarioTermino = decimalToTime(escalaData.HorarioTerm);
    }
    escala.horarioFormatado = `${escala.horarioInicio || '--:--'} às ${escala.horarioTermino || '--:--'}`;
    
    escala.PostoGrad = escalaData.PostoGrad || escalaData.Posto_Grad || '-';
    
    if (escalaData.Estacao) {
        uniqueStations.add(escalaData.Estacao);
    }
    
    allEscalas.push(escala);
}

function sortAllEscalas() {
    allEscalas.sort((a, b) => {
        // 1. DATA (mais nova primeiro)
        const dateA = new Date(a.ano, a.mês - 1, a.dia);
        const dateB = new Date(b.ano, b.mês - 1, b.dia);
        if (dateB.getTime() !== dateA.getTime()) {
            return dateB - dateA;
        }
        
        // 2. HORÁRIO (mais cedo primeiro)
        const horaA = a.HorarioInic || 0;
        const horaB = b.HorarioInic || 0;
        if (horaA !== horaB) {
            return horaA - horaB;
        }
        
        // 3. ID (agrupar IDs iguais)
        if (a.Id !== b.Id) {
            const idA = String(a.Id || '');
            const idB = String(b.Id || '');
            return idA.localeCompare(idB);
        }
        
        // 4. POSTO/GRAD
        const postoA = HIERARQUIA_POSTOS[a.PostoGrad] || 999;
        const postoB = HIERARQUIA_POSTOS[b.PostoGrad] || 999;
        if (postoA !== postoB) {
            return postoA - postoB;
        }
        
        // 5. RE
        const reA = parseInt(a.RE) || 0;
        const reB = parseInt(b.RE) || 0;
        return reA - reB;
    });
}

// ✅ Carrega confirmações APENAS para a página atual
async function loadConfirmacoesForCurrentPage() {
    confirmacoesCache = {};
    
    // Pegar IDs das escalas da página atual
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredEscalas.length);
    const pageEscalas = filteredEscalas.slice(startIndex, endIndex);
    
    const escalaIds = new Set();
    pageEscalas.forEach(escala => {
        if (escala.Id) {
            escalaIds.add(escala.Id.toString());
        }
    });
    
    if (escalaIds.size === 0) return;
    
    console.log(`🔍 Carregando confirmações para ${escalaIds.size} IDs da página ${currentPage}`);
    
    const promises = Array.from(escalaIds).map(id => 
        loadConfirmacaoById(id).catch(err => {
            console.warn(`⚠️ Erro ao carregar confirmação ${id}:`, err);
            return null;
        })
    );
    
    await Promise.all(promises);
}

// ✅ Carrega UMA confirmação específica
async function loadConfirmacaoById(escalaId) {
    try {
        const confirmacaoRef = ref(database, `confirmacoes/${escalaId}`);
        const snapshot = await get(confirmacaoRef);
        
        if (snapshot.exists()) {
            confirmacoesCache[escalaId] = {
                dadosGerais: snapshot.child('dados_gerais').val() || {},
                militares: {}
            };
            
            snapshot.forEach((militarSnapshot) => {
                if (militarSnapshot.key !== 'dados_gerais') {
                    const re = militarSnapshot.key.replace('RE_', '');
                    confirmacoesCache[escalaId].militares[re] = militarSnapshot.val();
                }
            });
        }
        
        return true;
        
    } catch (error) {
        console.error(`❌ Erro ao carregar confirmação ${escalaId}:`, error);
        return false;
    }
}

// ==================== CONFIGURAÇÃO DE EVENTOS ====================

function setupEventListeners() {
    // Busca
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (currentSearchType === 'RE') {
                this.value = this.value.replace(/\D/g, '').slice(0, 6);
            }
            applyFilters();
        });
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') applyFilters();
        });
    }
    
    // Tipo de busca
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) {
        searchTypeSelect.addEventListener('change', function() {
            currentSearchType = this.value;
            const searchInput = document.getElementById('searchRE');
            if (searchInput) {
                searchInput.placeholder = `Filtrar por ${getSearchPlaceholder(currentSearchType)}`;
                searchInput.value = '';
                applyFilters();
            }
        });
    }
    
    // ✅ FILTROS DE DATA COM DEBOUNCE
    setupFilterChangeEvents();
    
    // ✅ ESTAÇÃO - Apenas filtra localmente
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        stationFilter.addEventListener('change', applyFilters);
    }
    
    // Botões
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshEscalas);
    
    const exportBtn = document.getElementById('exportExcel');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
    
    // ✅ BOTÃO HOJE
    const todayBtn = document.getElementById('todayFilter');
    if (todayBtn) {
        todayBtn.addEventListener('click', window.applyTodayFilter);
    }
    
    const tutorialBtn = document.getElementById('tutorialBtn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', function() { 
            window.open('https://www.youtube.com/', '_blank'); 
        });
    }
    
    // Botões de confirmação
    document.addEventListener('click', function(e) {
        const confirmBtn = e.target.closest('.confirm-btn');
        if (confirmBtn) {
            const escalaId = confirmBtn.getAttribute('data-escala-id');
            const re = confirmBtn.getAttribute('data-re');
            if (escalaId && re) openConfirmModal(escalaId, re);
        }
    });
    
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'saveConfirm') saveConfirmation();
    });
}

// ✅ FILTROS DE DATA COM DEBOUNCE
function setupFilterChangeEvents() {
    const dayFilter = document.getElementById('filterDay');
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    
    const onFilterChange = function() {
        const year = yearFilter?.value;
        const month = monthFilter?.value;
        const day = dayFilter?.value;
        
        if (!year || !month) return;
        
        // 🎯 DEBOUNCE: Cancela o timeout anterior
        if (filterTimeoutId) {
            console.log('⏱️ Debounce: cancelando busca anterior');
            clearTimeout(filterTimeoutId);
        }
        
        // ✅ MOSTRAR LOADING IMEDIATAMENTE
        showLoading(true);
        
        // 🎯 DEBOUNCE: Agenda nova busca após 5 segundos
        filterTimeoutId = setTimeout(async () => {
            console.log(`🚀 Debounce finalizado! Carregando: ${day ? day + '/' : ''}${month}/${year}`);
            
            if (day) {
                await window.loadPeriod(parseInt(year), parseInt(month), parseInt(day));
            } else {
                // Se não tem dia, limpa a tabela
                filteredEscalas = [];
                currentYear = parseInt(year);
                currentMonth = parseInt(month);
                currentDay = null;
                currentPage = 1;
                renderTable();
                updateStatistics();
                showMessage('Selecione um dia para visualizar as escalas.', 'info');
                
                // ✅ ESCONDER LOADING
                showLoading(false);
            }
            
            filterTimeoutId = null;
        }, 5000); // ⏱️ 5 SEGUNDOS DE DEBOUNCE
    };
    
    if (dayFilter) dayFilter.addEventListener('change', onFilterChange);
    if (monthFilter) monthFilter.addEventListener('change', onFilterChange);
    if (yearFilter) yearFilter.addEventListener('change', onFilterChange);
}

// ==================== FUNÇÕES DE FILTRO LOCAL ====================

function applyFilters() {
    const searchValue = document.getElementById('searchRE').value.trim();
    const dayFilter = document.getElementById('filterDay').value;
    const monthFilter = document.getElementById('filterMonth').value;
    const yearFilter = document.getElementById('filterYear').value;
    const stationFilter = document.getElementById('filterStation').value;
    
    // Filtrar apenas as escalas do dia atual (se houver)
    let baseEscalas = allEscalas;
    if (currentYear && currentMonth && currentDay) {
        baseEscalas = allEscalas.filter(e => 
            e.ano === currentYear && e.mês === currentMonth && e.dia === currentDay
        );
    }
    
    filteredEscalas = baseEscalas.filter(escala => {
        // Filtro de busca
        if (searchValue) {
            let fieldValue = '';
            
            switch(currentSearchType) {
                case 'RE': fieldValue = escala.RE ? escala.RE.toString() : ''; break;
                case 'Militar': fieldValue = escala.Militar || ''; break;
                case 'Estacao': fieldValue = escala.Estacao || ''; break;
                case 'Composicao': fieldValue = escala.Composicao || ''; break;
                case 'ID': fieldValue = escala.Id ? escala.Id.toString() : ''; break;
            }
            
            if (!fieldValue.toLowerCase().includes(searchValue.toLowerCase())) {
                return false;
            }
        }
        
        // Filtro de estação
        if (stationFilter && escala.Estacao) {
            const nomeEstacao = stationsCache[escala.Estacao] || escala.Estacao;
            if (nomeEstacao !== stationFilter) return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTable();
    updateStatistics();
    
    // Recarregar confirmações para a nova página
    loadConfirmacoesForCurrentPage();
}

function clearFilters() {
    // Limpar campos de busca
    document.getElementById('searchRE').value = '';
    
    // Limpar estação
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) stationFilter.value = '';
    
    // Resetar tipo de busca
    currentSearchType = 'RE';
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) searchTypeSelect.value = 'RE';
    
    const searchInput = document.getElementById('searchRE');
    if (searchInput) searchInput.placeholder = 'Filtrar por RE (6 dígitos)';
    
    // Aplicar filtros na lista atual
    applyFilters();
    
    showMessage('Filtros de busca limpos com sucesso.', 'success');
}

function refreshEscalas() {
    if (currentYear && currentMonth && currentDay) {
        window.loadPeriod(currentYear, currentMonth, currentDay);
    }
}

// ==================== FUNÇÕES DE UTILIDADE ====================

function decimalToTime(decimal) {
    if (decimal === undefined || decimal === null) return '--:--';
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const [day, month, year] = dateString.split('/').map(Number);
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
    } catch {
        return dateString;
    }
}

function getMonthName(monthNumber) {
    if (!monthNumber) return '';
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return monthNames[monthNumber - 1] || monthNumber;
}

function getComposicaoColor(composicao) {
    if (!composicao) return 'bg-secondary';
    const composicaoUpper = composicao.toUpperCase();
    if (composicaoUpper.includes('INCÊNDIO') || composicaoUpper.includes('RESGATE')) return 'bg-danger';
    if (composicaoUpper.includes('SALVAMENTO')) return 'bg-success';
    if (composicaoUpper.includes('GUARNIÇÃO')) return 'bg-warning';
    if (composicaoUpper.includes('SOCORRO')) return 'bg-info';
    if (composicaoUpper.includes('EMERGÊNCIA')) return 'bg-primary';
    return 'bg-secondary';
}

function getEscalaLink(escalaId) {
    if (!escalaId) return '#';
    return `http://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${escalaId}`;
}

function isValidSEILink(link) {
    if (!link) return false;
    return link.startsWith('https://sei.sp.gov.br/') || link.startsWith('http://sei.sp.gov.br/');
}

function getConfirmacaoStatus(escalaId, re) {
    if (!escalaId || !re || !confirmacoesCache[escalaId]) return null;
    return confirmacoesCache[escalaId].militares[re] || null;
}

function getConfirmacaoIcon(status, escalaId, re) {
    const baseClass = 'btn btn-sm confirm-btn';
    const dataAttrs = `data-escala-id="${escalaId}" data-re="${re}"`;
    
    switch(status) {
        case 'concluida':
            return `<button class="${baseClass} btn-success" title="Concluída" ${dataAttrs}>
                      <i class="fas fa-check"></i>
                    </button>`;
        case 'novidade':
            return `<button class="${baseClass} btn-danger" title="Novidade" ${dataAttrs}>
                      <i class="fas fa-times"></i>
                    </button>`;
        default:
            return `<button class="${baseClass} btn-outline-secondary" title="Confirmar escala" ${dataAttrs}>
                      <i class="far fa-clock"></i>
                    </button>`;
    }
}

function getSearchPlaceholder(type) {
    const placeholders = {
        'RE': 'RE (6 dígitos)',
        'Militar': 'Nome do militar',
        'Estacao': 'Estação',
        'Composicao': 'Composição',
        'ID': 'ID da escala'
    };
    return placeholders[type] || 'Buscar...';
}

// ==================== FUNÇÕES DE TABELA ====================

function renderTable() {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    const infoText = document.getElementById('infoText');
    const pagination = document.getElementById('pagination');
    
    if (!tbody || !noDataDiv || !infoText || !pagination) {
        console.error('❌ Elementos da tabela não encontrados');
        return;
    }
    
    if (filteredEscalas.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        infoText.textContent = 'Mostrando 0 de 0 registros';
        pagination.innerHTML = '';
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    const totalPages = Math.ceil(filteredEscalas.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredEscalas.length);
    const pageEscalas = filteredEscalas.slice(startIndex, endIndex);
    
    let html = '';
    
    const escalasPorId = {};
    filteredEscalas.forEach(escala => {
        if (escala.Id) {
            if (!escalasPorId[escala.Id]) escalasPorId[escala.Id] = [];
            escalasPorId[escala.Id].push(escala);
        }
    });
    
    pageEscalas.forEach((escala, index) => {
        const isUserEscala = userRE && escala.RE && escala.RE.toString() === userRE;
        
        const confirmacao = getConfirmacaoStatus(escala.Id, escala.RE);
        const confirmacaoIcon = getConfirmacaoIcon(confirmacao ? confirmacao.status : null, escala.Id, escala.RE);
        
        const countSameId = escala.Id ? (escalasPorId[escala.Id] || []).length : 0;
        
        let rowClass = '';
        if (isUserEscala) rowClass += 'table-info ';
        if (countSameId > 1) {
            const idNum = parseInt(escala.Id) || 0;
            rowClass += idNum % 2 === 0 ? 'escala-grupo-par ' : 'escala-grupo-impar ';
        }
        
        const escalaLink = getEscalaLink(escala.Id);
        const temConfirmacao = confirmacao !== null;
        const temLinkSEI = temConfirmacao && confirmacoesCache[escala.Id]?.dadosGerais?.sei_link;

        const adminLinkIcon = (userNivel === 1 && escala.Id && temConfirmacao && temLinkSEI) ? 
            `<a href="${confirmacoesCache[escala.Id].dadosGerais.sei_link}" target="_blank" class="btn btn-sm btn-outline-info ms-1" title="Abrir documento SEI">
                <i class="fas fa-paperclip"></i>
            </a>` : '';

        const estacaoNome = stationsCache[escala.Estacao] || escala.Estacao || '-';

        html += `
            <tr class="${rowClass.trim()}" data-escala-id="${escala.Id}" data-escala-re="${escala.RE}">
                <td>
                    <div class="fw-bold">${formatDate(escala.Data)}</div>
                    <small class="text-muted">${getMonthName(escala.mês)}</small>
                </td>
                <td>${escala.horarioFormatado}</td>
                <td>${escala.OPM || '-'}</td>
                <td>
                    <span class="badge bg-secondary" title="${estacaoNome}">
                        ${estacaoNome}
                    </span>
                </td>
                <td>
                    <span class="badge ${getComposicaoColor(escala.Composicao)}">
                        ${escala.Composicao || '-'}
                    </span>
                </td>
                <td>${escala.PostoGrad || '-'}</td>
                <td>${escala.RE || '-'}</td>
                <td>
                    <div class="fw-bold">${escala.Militar || '-'}</div>
                </td>
                <td>
                    <a href="${escalaLink}" target="_blank" class="text-primary fw-bold escala-id-link" title="Abrir escala no sistema">
                        ${escala.Id || '-'}
                    </a>
                    ${countSameId > 1 ? `<span class="badge bg-info ms-1">×${countSameId}</span>` : ''}
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        ${confirmacaoIcon}
                        ${adminLinkIcon}
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    infoText.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filteredEscalas.length} registros`;
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})" aria-label="Anterior">
                <span aria-hidden="true">&laquo;</span>
            </a>
        </li>
    `;
    
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
                </li>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
    }
    
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})" aria-label="Próximo">
                <span aria-hidden="true">&raquo;</span>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

window.changePage = function(page) {
    if (page < 1 || page > Math.ceil(filteredEscalas.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Carregar confirmações para a nova página
    loadConfirmacoesForCurrentPage();
};

// ==================== FUNÇÕES DE ESTATÍSTICAS ====================

function countUniqueEscalaIds(escalas) {
    const uniqueIds = new Set();
    escalas.forEach(escala => { if (escala.Id) uniqueIds.add(escala.Id.toString()); });
    return uniqueIds.size;
}

function countTotalVagas(escalas) { return escalas.length; }

function countUniqueMilitares(escalas) {
    const uniqueREs = new Set();
    escalas.forEach(escala => { if (escala.RE) uniqueREs.add(escala.RE.toString()); });
    return uniqueREs.size;
}

function updateStatistics() {
    const totalVagas = document.getElementById('totalVagas');
    const totalEscalas = document.getElementById('totalEscalas');
    const totalMilitares = document.getElementById('totalMilitares');
    const mesAtual = document.getElementById('mesAtual');
    const anoAtual = document.getElementById('anoAtual');
    
    if (!totalVagas || !totalEscalas || !totalMilitares || !mesAtual || !anoAtual) return;
    
    totalVagas.textContent = countTotalVagas(filteredEscalas).toLocaleString('pt-BR');
    totalEscalas.textContent = countUniqueEscalaIds(filteredEscalas).toLocaleString('pt-BR');
    totalMilitares.textContent = countUniqueMilitares(filteredEscalas).toLocaleString('pt-BR');
    
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (monthFilter && monthFilter.value) {
        mesAtual.textContent = monthNames[parseInt(monthFilter.value) - 1];
    } else {
        mesAtual.textContent = currentMonth ? monthNames[currentMonth - 1] : 'Todos';
    }
    
    if (yearFilter && yearFilter.value) {
        anoAtual.textContent = yearFilter.value;
    } else {
        anoAtual.textContent = currentYear || '-';
    }
}

// ==================== FUNÇÕES DE MODAL ====================

function createModalIfNotExists() {
    if (document.getElementById('confirmModal')) return;
    
    const modalHTML = `
        <div class="modal fade" id="confirmModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div id="confirmContent">
                        <div class="text-center py-5">
                            <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
                            <p class="mt-3">Carregando dados da escala...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.openConfirmModal = async function(escalaId, reClicado) {
    const escalasComMesmoId = allEscalas.filter(e => e.Id == escalaId);
    const usuarioEstaNaEscala = escalasComMesmoId.some(e => e.RE == userRE);
    const isAdmin = userNivel === 1;
    
    if (!usuarioEstaNaEscala && !isAdmin) {
        showMessage('Você não tem permissão para confirmar esta escala.', 'warning');
        return;
    }
    
    if (!confirmacoesCache[escalaId]) {
        await loadConfirmacaoById(escalaId);
    }
    
    const confirmacoesEscala = confirmacoesCache[escalaId] || {};
    const dadosGerais = confirmacoesEscala.dadosGerais || {};
    const militaresConfirmacoes = confirmacoesEscala.militares || {};
    
    const primeiraEscala = escalasComMesmoId[0];
    
    let modalHTML = `
        <div class="modal-header">
            <h5 class="modal-title">
                <i class="fas fa-calendar-check me-2"></i>CONFIRMAR ESCALA #${escalaId}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
            <div class="row mb-4">
                <div class="col-md-6">
                    <p><strong><i class="fas fa-calendar me-1"></i> Data:</strong> ${formatDate(primeiraEscala.Data)}</p>
                    <p><strong><i class="fas fa-clock me-1"></i> Horário:</strong> ${primeiraEscala.horarioFormatado}</p>
                </div>
                <div class="col-md-6">
                    <p><strong><i class="fas fa-map-marker-alt me-1"></i> Estação:</strong> ${stationsCache[primeiraEscala.Estacao] || primeiraEscala.Estacao || '-'}</p>
                    <p><strong><i class="fas fa-car me-1"></i> Composição:</strong> ${primeiraEscala.Composicao || '-'}</p>
                </div>
            </div>
            
            <h6 class="mb-3"><i class="fas fa-users me-1"></i> MILITARES NESTA ESCALA:</h6>
            <div class="table-responsive mb-4">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Militar</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    escalasComMesmoId.forEach((escala, index) => {
        const confirmacaoMilitar = militaresConfirmacoes[escala.RE] || {};
        const isCurrentUser = (escala.RE == userRE);
        
        modalHTML += `
            <tr ${isCurrentUser ? 'class="table-info"' : ''}>
                <td>${index + 1}</td>
                <td>
                    <strong>${escala.PostoGrad} ${escala.RE}</strong><br>
                    <small>${escala.Militar}</small>
                    <input type="hidden" class="militar-re" value="${escala.RE}">
                </td>
                <td>
                    <div class="btn-group btn-group-sm militar-status" data-re="${escala.RE}">
                        <input type="radio" class="btn-check" name="status_${escala.RE}" id="concluida_${escala.RE}" value="concluida" 
                               ${confirmacaoMilitar.status === 'concluida' ? 'checked' : ''}>
                        <label class="btn btn-outline-success" for="concluida_${escala.RE}">
                            <i class="fas fa-check"></i> Concluída
                        </label>
                        
                        <input type="radio" class="btn-check" name="status_${escala.RE}" id="novidade_${escala.RE}" value="novidade"
                               ${confirmacaoMilitar.status === 'novidade' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger" for="novidade_${escala.RE}">
                            <i class="fas fa-times"></i> Novidade
                        </label>
                    </div>
                </td>
            </tr>
        `;
    });
    
    modalHTML += `
                    </tbody>
                </table>
            </div>
            
            <div class="mb-3">
                <label for="seiLink" class="form-label">
                    <i class="fas fa-link me-1"></i>LINK DO DOCUMENTO DO SEI (obrigatório):
                </label>
                <input type="url" class="form-control" id="seiLink" 
                       value="${dadosGerais.sei_link || ''}" 
                       placeholder="https://sei.sp.gov.br/..." required>
                <div class="form-text text-warning">
                    <i class="fas fa-exclamation-triangle me-1"></i>
                    O link deve começar com https://sei.sp.gov.br/ ou http://sei.sp.gov.br/
                </div>
            </div>
            
            <div class="mb-3">
                <label for="observacoes" class="form-label">
                    <i class="fas fa-sticky-note me-1"></i>OBSERVAÇÕES:
                </label>
                <textarea class="form-control" id="observacoes" rows="3" 
                          placeholder="Observações sobre a escala...">${dadosGerais.observacoes || ''}</textarea>
            </div>
            
            <input type="hidden" id="modalEscalaId" value="${escalaId}">
            <input type="hidden" id="modalUserRE" value="${userRE}">
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i>Cancelar
            </button>
            <button type="button" class="btn btn-primary" id="saveConfirm">
                <i class="fas fa-save me-1"></i>Salvar
            </button>
        </div>
    `;
    
    const confirmContent = document.getElementById('confirmContent');
    if (!confirmContent) return;
    
    confirmContent.innerHTML = modalHTML;
    
    const modalElement = document.getElementById('confirmModal');
    if (!modalElement) return;
    
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
};

async function saveConfirmation() {
    const escalaId = document.getElementById('modalEscalaId')?.value;
    const userRE = document.getElementById('modalUserRE')?.value;
    const seiLink = document.getElementById('seiLink')?.value.trim();
    
    if (!escalaId || !userRE) {
        showMessage('Erro: Dados da escala não encontrados.', 'error');
        return;
    }
    
    if (!seiLink) {
        showMessage('O link do documento SEI é obrigatório!', 'warning');
        return;
    }
    
    if (!isValidSEILink(seiLink)) {
        showMessage('O link do SEI deve começar com https://sei.sp.gov.br/ ou http://sei.sp.gov.br/', 'warning');
        return;
    }
    
    const statusMilitares = {};
    const militarElements = document.querySelectorAll('.militar-status');
    
    let hasValidStatus = false;
    
    militarElements.forEach(element => {
        const re = element.getAttribute('data-re');
        const selectedStatus = element.querySelector('input[type="radio"]:checked');
        
        if (selectedStatus) {
            statusMilitares[re] = selectedStatus.value;
            hasValidStatus = true;
        } else {
            statusMilitares[re] = null;
        }
    });
    
    if (!hasValidStatus) {
        showMessage('Selecione um status para pelo menos um militar!', 'warning');
        return;
    }
    
    try {
        const saveBtn = document.getElementById('saveConfirm');
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando...';
        saveBtn.disabled = true;
        
        const timestamp = Date.now();
        
        await set(ref(database, `confirmacoes/${escalaId}/dados_gerais`), {
            sei_link: seiLink,
            observacoes: document.getElementById('observacoes')?.value.trim() || '',
            ultima_atualizacao: timestamp,
            atualizado_por: userRE
        });
        
        const savePromises = [];
        
        for (const [re, status] of Object.entries(statusMilitares)) {
            if (status) {
                savePromises.push(
                    set(ref(database, `confirmacoes/${escalaId}/RE_${re}`), {
                        status: status,
                        confirmado_por: userRE,
                        data_confirmacao: timestamp
                    })
                );
            }
        }
        
        await Promise.all(savePromises);
        
        if (!confirmacoesCache[escalaId]) confirmacoesCache[escalaId] = { dadosGerais: {}, militares: {} };
        
        confirmacoesCache[escalaId].dadosGerais = {
            sei_link: seiLink,
            observacoes: document.getElementById('observacoes')?.value.trim() || '',
            ultima_atualizacao: timestamp,
            atualizado_por: userRE
        };
        
        for (const [re, status] of Object.entries(statusMilitares)) {
            if (status) {
                confirmacoesCache[escalaId].militares[re] = {
                    status: status,
                    confirmado_por: userRE,
                    data_confirmacao: timestamp
                };
            }
        }
        
        const modalElement = document.getElementById('confirmModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
        }
        
        renderTable();
        showMessage('Confirmação salva com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar confirmação:', error);
        showError('Erro ao salvar: ' + error.message);
    } finally {
        const saveBtn = document.getElementById('saveConfirm');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Salvar';
            saveBtn.disabled = false;
        }
    }
}

// ==================== EXPORTAÇÃO ====================

function exportToExcel() {
    try {
        if (filteredEscalas.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        const wsData = filteredEscalas.map(escala => {
            const confirmacao = getConfirmacaoStatus(escala.Id, escala.RE);
            const estacaoNome = stationsCache[escala.Estacao] || escala.Estacao || '';
            
            return {
                'Data': escala.Data || '',
                'Horário': escala.horarioFormatado || '',
                'OPM': escala.OPM || '',
                'Estação': estacaoNome,
                'Código Estação': escala.Estacao || '',
                'Composição': escala.Composicao || '',
                'Posto/Grad': escala.PostoGrad || '',
                'RE': escala.RE || '',
                'Militar': escala.Militar || '',
                'ID': escala.Id || '',
                'Status': confirmacao ? (confirmacao.status === 'concluida' ? 'Concluída' : 'Novidade') : 'Pendente',
                'Data Confirmação': confirmacao && confirmacao.data_confirmacao ? 
                    new Date(confirmacao.data_confirmacao).toLocaleString('pt-BR') : '',
                'Mês': escala.mês || '',
                'Ano': escala.ano || ''
            };
        });
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wscols = [
            {wch: 10}, {wch: 15}, {wch: 10}, {wch: 25}, {wch: 15}, {wch: 20},
            {wch: 12}, {wch: 8}, {wch: 25}, {wch: 10}, {wch: 10},
            {wch: 20}, {wch: 5}, {wch: 6}
        ];
        ws['!cols'] = wscols;
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Escalas');
        
        const today = new Date().toISOString().split('T')[0];
        const fileName = `escalas_${today}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        showMessage(`Arquivo ${fileName} gerado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

// ==================== FUNÇÕES DE UI ====================

function showLoading(show) {
    const tbody = document.getElementById('escalasBody');
    const noDataDiv = document.getElementById('noData');
    
    if (show) {
        if (tbody) tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 text-muted">Carregando escalas...</p>
                </td>
            </tr>
        `;
        if (noDataDiv) noDataDiv.classList.add('d-none');
    }
}

function showMessage(message, type = 'info') {
    const existingAlerts = document.querySelectorAll('.temp-alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} temp-alert alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} me-2"></i>
            <div>${message}</div>
            <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) alertDiv.remove();
    }, 3000);
}

function showError(message) {
    showMessage(message, 'danger');
}

async function loadNavbar() {
    try {
        const { loadNavbar } = await import('./auth-check.js');
        return loadNavbar();
    } catch (error) {
        console.warn('⚠️ Não foi possível carregar navbar:', error);
    }
}

// ==================== INICIALIZAÇÃO ====================

if (!window.location.pathname.includes('app.html')) {
    document.addEventListener('DOMContentLoaded', initEscalas);
}