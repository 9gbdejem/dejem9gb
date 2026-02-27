// js/exclusoes.js - Versão Otimizada (Carrega apenas mês/ano corrente)
import { database } from './firebase-config.js';
import { checkAuth } from './auth-check.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// ==================== VARIÁVEIS GLOBAIS ====================
let allExclusoes = [];
let filteredExclusoes = [];
let currentPage = 1;
const itemsPerPage = 15;
let uniqueStations = new Set();
let uniqueYears = new Set();
let uniqueMonths = new Set();
let currentSearchType = 'RE';
let userNivel = 3;
let userRE = '';

// Variáveis de filtro
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentStation = '';
let currentSearch = '';
let loadingTimer = null;
let isDataLoaded = false;

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================
export async function initExclusoesSPA() {
    await initializeApp();
}

async function initExclusoes() {
    await initializeApp();
}

async function initializeApp() {
    try {
        const { userData, re } = await checkAuth(2);
        
        userRE = re;
        userNivel = userData.nivel || 3;
        
        sessionStorage.setItem('userRE', userRE);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userNivel', userNivel);
        sessionStorage.setItem('currentUserLevel', userNivel);
        
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        setupEventListeners();
        
        // Preencher filtros
        populateFilters();
        
        // Carregar dados do mês/ano atual
        await loadExclusoesMesAtual();
        
        // Aplicar filtros iniciais
        applyFilters();
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        if (!error.message.includes('Nível insuficiente')) {
            showError('Erro ao carregar: ' + error.message);
        }
    }
}

// ==================== FUNÇÕES DE CARREGAMENTO DE DADOS ====================
async function loadExclusoesMesAtual() {
    try {
        // Mostrar loading imediatamente
        showLoading(true);
        
        // Determinar mês e ano atual
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = (hoje.getMonth() + 1).toString().padStart(2, '0');
        
        console.log(`📅 Carregando exclusões de ${mes}/${ano}...`);
        
        // Atualizar selects com mês/ano atual
        const monthSelect = document.getElementById('filterMonth');
        const yearSelect = document.getElementById('filterYear');
        
        if (monthSelect) monthSelect.value = parseInt(mes);
        if (yearSelect) yearSelect.value = ano;
        
        // Buscar apenas o nó específico: escalados/ANO/MÊS
        const caminho = `escalados/${ano}/${mes}`;
        const exclusoesRef = ref(database, caminho);
        const snapshot = await get(exclusoesRef);
        
        allExclusoes = [];
        uniqueStations.clear();
        uniqueYears.clear();
        uniqueMonths.clear();
        
        if (snapshot.exists()) {
            snapshot.forEach((daySnapshot) => {
                const dia = daySnapshot.key;
                
                daySnapshot.forEach((escalaSnapshot) => {
                    const escalaKey = escalaSnapshot.key;
                    const escalaData = escalaSnapshot.val();
                    
                    // FILTRAR APENAS EXCLUSÕES (Exclusao === "X")
                    if (escalaData.Exclusao === "X" || escalaData.Exclusao === "x") {
                        processarExclusao(escalaData, ano, mes, dia, escalaKey);
                    }
                });
            });
            
            console.log(`✅ ${allExclusoes.length} exclusões carregadas para ${mes}/${ano}`);
        } else {
            console.log(`📭 Nenhuma exclusão encontrada em ${mes}/${ano}`);
            allExclusoes = [];
        }
        
        // Adicionar ano/mês aos conjuntos únicos
        uniqueYears.add(parseInt(ano));
        uniqueMonths.add(parseInt(mes));
        
        // Ordenar por data (mais recente primeiro)
        allExclusoes.sort((a, b) => {
            if (a.ano !== b.ano) return b.ano - a.ano;
            if (a.mês !== b.mês) return b.mês - a.mês;
            return b.dia - a.dia;
        });
        
        isDataLoaded = true;
        
    } catch (error) {
        console.error('💥 Erro ao carregar exclusões:', error);
        showError('Erro ao carregar exclusões: ' + error.message);
        allExclusoes = [];
    } finally {
        showLoading(false);
    }
}

// ✅ FUNÇÃO CORRIGIDA: Carregar mês específico (sem erro de padStart)
async function loadExclusoesPorMesAno(ano, mes) {
    try {
        // Mostrar loading imediatamente
        showLoading(true);
        
        // ✅ CORREÇÃO: Converter para string com padStart apenas se for número
        const anoStr = ano.toString();
        const mesNum = parseInt(mes);
        const mesStr = mesNum.toString().padStart(2, '0');
        
        console.log(`📅 Carregando exclusões de ${mesStr}/${anoStr}...`);
        
        const caminho = `escalados/${anoStr}/${mesStr}`;
        const exclusoesRef = ref(database, caminho);
        const snapshot = await get(exclusoesRef);
        
        allExclusoes = [];
        uniqueStations.clear();
        uniqueYears.clear();
        uniqueMonths.clear();
        
        if (snapshot.exists()) {
            snapshot.forEach((daySnapshot) => {
                const dia = daySnapshot.key;
                
                daySnapshot.forEach((escalaSnapshot) => {
                    const escalaKey = escalaSnapshot.key;
                    const escalaData = escalaSnapshot.val();
                    
                    if (escalaData.Exclusao === "X" || escalaData.Exclusao === "x") {
                        processarExclusao(escalaData, anoStr, mesStr, dia, escalaKey);
                    }
                });
            });
            
            console.log(`✅ ${allExclusoes.length} exclusões carregadas`);
        } else {
            console.log(`📭 Nenhuma exclusão encontrada`);
            allExclusoes = [];
        }
        
        // Adicionar ano/mês aos conjuntos únicos
        uniqueYears.add(parseInt(anoStr));
        uniqueMonths.add(parseInt(mesStr));
        
        // Ordenar
        allExclusoes.sort((a, b) => {
            if (a.ano !== b.ano) return b.ano - a.ano;
            if (a.mês !== b.mês) return b.mês - a.mês;
            return b.dia - a.dia;
        });
        
        isDataLoaded = true;
        
        // Atualizar filtros com os novos dados
        populateFilters();
        applyFilters();
        
    } catch (error) {
        console.error('💥 Erro ao carregar exclusões:', error);
        showError('Erro ao carregar exclusões: ' + error.message);
        allExclusoes = [];
    } finally {
        showLoading(false);
    }
}

// ✅ FUNÇÃO CORRIGIDA: processarExclusao (sem erro de padStart)
function processarExclusao(escalaData, year, month, day, escalaKey) {
    // ✅ CORREÇÃO: Garantir que year, month, day sejam strings
    const yearStr = year.toString();
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    
    const exclusao = {
        ...escalaData,
        escalaKey: escalaKey,
        ano: parseInt(yearStr),
        mês: parseInt(monthStr),
        dia: parseInt(dayStr),
        Data: `${dayStr}/${monthStr}/${yearStr}`,
        Id: escalaData.Id || '',
        RE: escalaData.RE || '',
        linhaId: `${yearStr}/${monthStr}/${dayStr}/${escalaKey}`
    };
    
    // Converter horários
    if (escalaData.HorarioInic !== undefined) {
        exclusao.horarioInicio = decimalToTime(escalaData.HorarioInic);
    }
    if (escalaData.HorarioTerm !== undefined) {
        exclusao.horarioTermino = decimalToTime(escalaData.HorarioTerm);
    }
    exclusao.horarioFormatado = `${exclusao.horarioInicio || '--:--'} às ${exclusao.horarioTermino || '--:--'}`;
    
    // Corrigir PostoGrad
    exclusao.PostoGrad = escalaData.PostoGrad || escalaData.Posto_Grad || '-';
    
    // Campo Documento
    exclusao.Documento = escalaData.Documento || '';
    
    // Adicionar aos conjuntos únicos
    uniqueYears.add(parseInt(yearStr));
    uniqueMonths.add(parseInt(monthStr));
    
    if (escalaData.Estacao) {
        uniqueStations.add(escalaData.Estacao);
    }
    
    allExclusoes.push(exclusao);
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
    
    if (composicaoUpper.includes('INCÊNDIO') || composicaoUpper.includes('RESGATE')) {
        return 'bg-danger';
    } else if (composicaoUpper.includes('SALVAMENTO')) {
        return 'bg-success';
    } else if (composicaoUpper.includes('GUARNIÇÃO')) {
        return 'bg-warning';
    } else if (composicaoUpper.includes('SOCORRO')) {
        return 'bg-info';
    } else if (composicaoUpper.includes('EMERGÊNCIA')) {
        return 'bg-primary';
    }
    
    return 'bg-secondary';
}

function getEscalaLink(escalaId) {
    if (!escalaId) return '#';
    return `http://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${escalaId}`;
}

// ==================== FUNÇÕES DE TABELA ====================
function renderTable() {
    const tbody = document.getElementById('exclusoesBody');
    const noDataDiv = document.getElementById('noData');
    const infoText = document.getElementById('infoText');
    const pagination = document.getElementById('pagination');
    
    if (!tbody || !noDataDiv || !infoText || !pagination) {
        console.error('❌ Elementos da tabela não encontrados');
        return;
    }
    
    // Se ainda não carregou dados, não renderizar
    if (!isDataLoaded) {
        return;
    }
    
    if (filteredExclusoes.length === 0) {
        tbody.innerHTML = '';
        noDataDiv.classList.remove('d-none');
        infoText.textContent = 'Mostrando 0 de 0 registros';
        pagination.innerHTML = '';
        return;
    }
    
    noDataDiv.classList.add('d-none');
    
    const totalPages = Math.ceil(filteredExclusoes.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredExclusoes.length);
    const pageExclusoes = filteredExclusoes.slice(startIndex, endIndex);
    
    let html = '';
    
    // Agrupar exclusões por ID para contar e destacar
    const exclusoesPorId = {};
    filteredExclusoes.forEach(exclusao => {
        if (exclusao.Id) {
            if (!exclusoesPorId[exclusao.Id]) {
                exclusoesPorId[exclusao.Id] = [];
            }
            exclusoesPorId[exclusao.Id].push(exclusao);
        }
    });
    
    pageExclusoes.forEach((exclusao, index) => {
        const globalIndex = startIndex + index + 1;
        
        // Contar quantos tem mesmo ID
        const countSameId = exclusao.Id ? (exclusoesPorId[exclusao.Id] || []).length : 0;
        
        // Cor de fundo para grupo de mesma ID
        let rowClass = '';
        if (countSameId > 1) {
            const idNum = parseInt(exclusao.Id) || 0;
            rowClass += idNum % 2 === 0 ? 'escala-grupo-par ' : 'escala-grupo-impar ';
        }
        
        // Gerar link para a escala original
        const escalaLink = getEscalaLink(exclusao.Id);

        html += `
            <tr class="${rowClass.trim()}" data-exclusao-id="${exclusao.Id}" data-exclusao-re="${exclusao.RE}">
                <td>
                    <div class="fw-bold">${formatDate(exclusao.Data)}</div>
                    <small class="text-muted">${getMonthName(exclusao.mês)}</small>
                </td>
                <td>${exclusao.horarioFormatado}</td>
                <td>${exclusao.OPM || '-'}</td>
                <td>
                    <span class="badge bg-secondary">${exclusao.Estacao || '-'}</span>
                </td>
                <td>
                    <span class="badge ${getComposicaoColor(exclusao.Composicao)}">
                        ${exclusao.Composicao || '-'}
                    </span>
                </td>
                <td>${exclusao.PostoGrad || '-'}</td>
                <td>
                    <span class="badge bg-dark">${exclusao.RE || '-'}</span>
                </td>
                <td>
                    <div class="fw-bold">${exclusao.Militar || '-'}</div>
                </td>
                <td>
                    <a href="${escalaLink}" target="_blank" class="text-primary fw-bold escala-id-link" title="Abrir escala original no sistema">
                        ${exclusao.Id || '-'}
                    </a>
                    ${countSameId > 1 ? `<span class="badge bg-info ms-1">×${countSameId}</span>` : ''}
                </td>
                <td>
                    <div class="documento-text" title="${exclusao.Documento || 'Sem documento'}" 
                         onclick="this.classList.toggle('expanded')" style="cursor: pointer; max-width: 300px;">
                        ${exclusao.Documento ? 
                            (exclusao.Documento.length > 50 ? 
                                `<span class="short">${exclusao.Documento.substring(0, 50)}...</span>
                                 <span class="full d-none">${exclusao.Documento}</span>` : 
                                exclusao.Documento) : 
                            '-'}
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    infoText.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${filteredExclusoes.length} registros`;
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
            <a class="page-link" href="#" onclick="window.changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="window.changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

window.changePage = function(page) {
    if (page < 1 || page > Math.ceil(filteredExclusoes.length / itemsPerPage)) return;
    currentPage = page;
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==================== FUNÇÕES DE FILTROS ====================
function setupEventListeners() {
    // Search input com debounce
    const searchInput = document.getElementById('searchRE');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (currentSearchType === 'RE') {
                this.value = this.value.replace(/\D/g, '').slice(0, 6);
            }
            
            // Debounce de 500ms para busca
            if (loadingTimer) clearTimeout(loadingTimer);
            loadingTimer = setTimeout(() => {
                applyFilters();
            }, 500);
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (loadingTimer) clearTimeout(loadingTimer);
                applyFilters();
            }
        });
    }
    
    // Search type
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) {
        searchTypeSelect.addEventListener('change', function() {
            currentSearchType = this.value;
            const searchInput = document.getElementById('searchRE');
            if (searchInput) {
                searchInput.placeholder = `Buscar por ${getSearchPlaceholder(currentSearchType)}`;
                searchInput.value = '';
                applyFilters();
            }
        });
    }
    
    // ✅ FILTROS DE MÊS/ANO COM DEBOUNCE DE 3 SEGUNDOS E LOADING
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) {
        monthFilter.addEventListener('change', function() {
            if (loadingTimer) clearTimeout(loadingTimer);
            
            // Mostrar loading imediatamente
            showLoading(true);
            
            loadingTimer = setTimeout(() => {
                aplicarFiltrosData();
            }, 3000);
        });
    }
    
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter) {
        yearFilter.addEventListener('change', function() {
            if (loadingTimer) clearTimeout(loadingTimer);
            
            // Mostrar loading imediatamente
            showLoading(true);
            
            loadingTimer = setTimeout(() => {
                aplicarFiltrosData();
            }, 3000);
        });
    }
    
    // Filtro de estação (filtragem local)
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        stationFilter.addEventListener('change', function() {
            if (loadingTimer) clearTimeout(loadingTimer);
            loadingTimer = setTimeout(() => {
                applyFilters();
            }, 500);
        });
    }
    
    // Botões
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshExclusoes);
    
    const exportBtn = document.getElementById('exportExcel');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
}

// ✅ FUNÇÃO CORRIGIDA: Aplicar filtros de data com recarregamento
async function aplicarFiltrosData() {
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    
    // Obter valores dos filtros
    const monthValue = monthFilter ? monthFilter.value : null;
    const yearValue = yearFilter ? yearFilter.value : null;
    
    // 🚨 VERIFICAR SE OS FILTROS ESTÃO EM BRANCO OU COM VALORES INVÁLIDOS
    const mesInvalido = !monthValue || monthValue === "" || monthValue === "Selecionar mês";
    const anoInvalido = !yearValue || yearValue === "" || yearValue === "Selecionar ano";
    
    // Se algum filtro estiver inválido, NÃO CARREGA NADA
    if (mesInvalido || anoInvalido) {
        console.log('⚠️ Filtro inválido detectado - exibindo noData');
        
        // Limpar dados
        filteredExclusoes = [];
        allExclusoes = [];
        
        // Esconder loading (se estiver visível)
        showLoading(false);
        
        // Mostrar noData
        const tbody = document.getElementById('exclusoesBody');
        const noDataDiv = document.getElementById('noData');
        const infoText = document.getElementById('infoText');
        const pagination = document.getElementById('pagination');
        
        if (tbody) tbody.innerHTML = '';
        if (noDataDiv) noDataDiv.classList.remove('d-none');
        if (infoText) infoText.textContent = 'Mostrando 0 de 0 registros';
        if (pagination) pagination.innerHTML = '';
        
        // Atualizar estatísticas com zero
        updateStatistics();
        
        return; // ⛔ SAI DA FUNÇÃO SEM CARREGAR DADOS
    }
    
    // Converter para números apenas se forem válidos
    const novoMes = parseInt(monthValue);
    const novoAno = parseInt(yearValue);
    
    // Se mudou mês ou ano, recarregar dados
    if (novoMes !== currentMonth || novoAno !== currentYear) {
        console.log(`📅 Mudança de data detectada: ${currentMonth}/${currentYear} → ${novoMes}/${novoAno}`);
        
        currentMonth = novoMes;
        currentYear = novoAno;
        
        await loadExclusoesPorMesAno(currentYear, currentMonth);
        // populateFilters já é chamado dentro de loadExclusoesPorMesAno
    } else {
        // Se não mudou, apenas aplicar filtros locais e esconder loading
        showLoading(false);
        applyFilters();
    }
}

function getSearchPlaceholder(type) {
    const placeholders = {
        'RE': 'RE (6 dígitos)',
        'Militar': 'Nome do militar',
        'Estacao': 'Estação',
        'Composicao': 'Composição',
        'ID': 'ID da escala',
        'Documento': 'Texto do documento'
    };
    return placeholders[type] || 'Buscar...';
}

function populateFilters() {
    // ✅ FILTRO DE MÊS - SEM opção "Todos"
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) {
        // Preservar o valor atual antes de recriar as opções
        const currentValue = monthFilter.value;
        
        while (monthFilter.options.length > 1) {
            monthFilter.remove(1);
        }
        
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        // Adicionar meses (1-12) - SEM opção "Todos"
        for (let month = 1; month <= 12; month++) {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = monthNames[month - 1];
            monthFilter.appendChild(option);
        }
        
        // Restaurar o valor selecionado ou usar o mês atual
        if (currentValue && currentValue !== "0") {
            try { monthFilter.value = currentValue; } catch (e) {}
        } else {
            monthFilter.value = currentMonth;
        }
    }
    
    // ✅ FILTRO DE ANOS - SEM opção "Todos"
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter) {
        // Preservar o valor atual antes de recriar as opções
        const currentValue = yearFilter.value;
        
        while (yearFilter.options.length > 1) {
            yearFilter.remove(1);
        }
        
        const anoAtual = new Date().getFullYear();
        const anos = [];
        
        // Anos de 2020 até ano atual + 1
        for (let ano = 2020; ano <= anoAtual + 1; ano++) {
            anos.push(ano);
        }
        
        anos.sort((a, b) => b - a); // Mais recente primeiro
        
        anos.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            yearFilter.appendChild(option);
        });
        
        // Restaurar o valor selecionado ou usar o ano atual
        if (currentValue && currentValue !== "0") {
            try { yearFilter.value = currentValue; } catch (e) {}
        } else {
            yearFilter.value = currentYear;
        }
    }
    
    // ✅ FILTRO DE ESTAÇÕES (apenas se houver dados)
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) {
        // Preservar o valor atual antes de recriar as opções
        const currentValue = stationFilter.value;
        
        while (stationFilter.options.length > 1) {
            stationFilter.remove(1);
        }
        
        // // Opção "Todas as estações" (valor vazio)
        // const allOption = document.createElement('option');
        // allOption.value = "";
        // allOption.textContent = "Todas as estações";
        // stationFilter.appendChild(allOption);
        
        if (uniqueStations.size > 0) {
            const sortedStations = Array.from(uniqueStations).sort();
            
            sortedStations.forEach(station => {
                const option = document.createElement('option');
                option.value = station;
                option.textContent = station;
                stationFilter.appendChild(option);
            });
        }
        
        // Restaurar o valor selecionado
        if (currentValue) {
            try { stationFilter.value = currentValue; } catch (e) {}
        }
    }
}

function applyFilters() {
    const searchValue = document.getElementById('searchRE').value.trim();
    const stationFilter = document.getElementById('filterStation').value;
    
    filteredExclusoes = allExclusoes.filter(exclusao => {
        // Filtro de busca
        if (searchValue) {
            let fieldValue = '';
            
            switch(currentSearchType) {
                case 'RE':
                    fieldValue = exclusao.RE ? exclusao.RE.toString() : '';
                    break;
                case 'Militar':
                    fieldValue = exclusao.Militar || '';
                    break;
                case 'Estacao':
                    fieldValue = exclusao.Estacao || '';
                    break;
                case 'Composicao':
                    fieldValue = exclusao.Composicao || '';
                    break;
                case 'ID':
                    fieldValue = exclusao.Id ? exclusao.Id.toString() : '';
                    break;
                case 'Documento':
                    fieldValue = exclusao.Documento || '';
                    break;
            }
            
            if (!fieldValue.toLowerCase().includes(searchValue.toLowerCase())) {
                return false;
            }
        }
        
        // Filtro de estação
        if (stationFilter && exclusao.Estacao) {
            if (exclusao.Estacao !== stationFilter) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1;
    renderTable();
    updateStatistics();
}

function clearFilters() {
    document.getElementById('searchRE').value = '';
    document.getElementById('filterStation').value = '';
    
    // Voltar para mês/ano atual
    const hoje = new Date();
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    
    if (monthFilter) monthFilter.value = hoje.getMonth() + 1;
    if (yearFilter) yearFilter.value = hoje.getFullYear();
    
    currentSearchType = 'RE';
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) searchTypeSelect.value = 'RE';
    
    const searchInput = document.getElementById('searchRE');
    if (searchInput) searchInput.placeholder = 'Buscar...';
    
    // Recarregar dados do mês atual
    currentMonth = hoje.getMonth() + 1;
    currentYear = hoje.getFullYear();
    
    loadExclusoesPorMesAno(currentYear, currentMonth).then(() => {
        showMessage('Filtros limpos com sucesso.', 'success');
    });
}

function refreshExclusoes() {
    console.log('🔄 Atualizando exclusões...');
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) {
        const originalHTML = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        refreshBtn.disabled = true;
        
        // Mostrar loading na tabela
        showLoading(true);
        
        loadExclusoesPorMesAno(currentYear, currentMonth).finally(() => {
            setTimeout(() => {
                refreshBtn.innerHTML = originalHTML;
                refreshBtn.disabled = false;
                showMessage('Dados atualizados com sucesso', 'success');
            }, 500);
        });
    } else {
        showLoading(true);
        loadExclusoesPorMesAno(currentYear, currentMonth);
    }
}

function updateStatistics() {
    const totalVagas = document.getElementById('totalVagas');
    const totalEscalas = document.getElementById('totalEscalas');
    const totalMilitares = document.getElementById('totalMilitares');
    const mesAtual = document.getElementById('mesAtual');
    const anoAtual = document.getElementById('anoAtual');
    
    if (!totalVagas || !totalEscalas || !totalMilitares || !mesAtual || !anoAtual) {
        console.error('❌ Elementos de estatísticas não encontrados');
        return;
    }
    
    // 1. Total de Exclusões (registros)
    const vagasCount = countTotalVagas(filteredExclusoes);
    totalVagas.textContent = vagasCount.toLocaleString('pt-BR');
    
    // 2. Total de Escalas com exclusões (IDs únicos)
    const escalasCount = countUniqueEscalaIds(filteredExclusoes);
    totalEscalas.textContent = escalasCount.toLocaleString('pt-BR');
    
    // 3. Total de Militares com exclusões (REs únicos)
    const militaresCount = countUniqueMilitares(filteredExclusoes);
    totalMilitares.textContent = militaresCount.toLocaleString('pt-BR');
    
    // 4. Mês atual
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const monthFilter = document.getElementById('filterMonth');
    const selectedMonth = monthFilter ? parseInt(monthFilter.value) : null;
    
    if (selectedMonth && selectedMonth > 0) {
        mesAtual.textContent = monthNames[selectedMonth - 1] || selectedMonth;
        mesAtual.title = `Mês: ${monthNames[selectedMonth - 1] || selectedMonth}`;
    } else {
        mesAtual.textContent = '-';
        mesAtual.title = 'Mês não selecionado';
    }
    
    // 5. Ano atual
    const yearFilter = document.getElementById('filterYear');
    const selectedYear = yearFilter ? parseInt(yearFilter.value) : null;
    
    if (selectedYear && selectedYear > 0) {
        anoAtual.textContent = selectedYear;
        anoAtual.title = `Ano: ${selectedYear}`;
    } else {
        anoAtual.textContent = '-';
        anoAtual.title = 'Ano não selecionado';
    }
    
    addStatisticsTooltips(vagasCount, escalasCount, militaresCount);
}

// ==================== FUNÇÕES DE EXPORTAÇÃO ====================
function exportToExcel() {
    try {
        if (filteredExclusoes.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        const wsData = filteredExclusoes.map(exclusao => ({
            'Data': exclusao.Data || '',
            'Horário': exclusao.horarioFormatado || '',
            'OPM': exclusao.OPM || '',
            'Estação': exclusao.Estacao || '',
            'Composição': exclusao.Composicao || '',
            'Posto/Grad': exclusao.PostoGrad || '',
            'RE': exclusao.RE || '',
            'Militar': exclusao.Militar || '',
            'ID': exclusao.Id || '',
            'Documento': exclusao.Documento || '',
            'Mês': exclusao.mês || '',
            'Ano': exclusao.ano || '',
            'Motivo': 'Exclusão'
        }));
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        
        const wscols = [
            {wch: 10}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 20},
            {wch: 12}, {wch: 8}, {wch: 25}, {wch: 10}, {wch: 50},
            {wch: 5}, {wch: 6}, {wch: 10}
        ];
        ws['!cols'] = wscols;
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Exclusões');
        
        const today = new Date().toISOString().split('T')[0];
        const fileName = `exclusoes_${today}.xlsx`;
        
        XLSX.writeFile(wb, fileName);
        
        showMessage(`Arquivo ${fileName} gerado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('💥 Erro ao exportar:', error);
        showError('Erro ao exportar para Excel: ' + error.message);
    }
}

// ==================== FUNÇÕES DE UI/HELPERS ====================
function showLoading(show) {
    const tbody = document.getElementById('exclusoesBody');
    const noDataDiv = document.getElementById('noData');
    
    if (show) {
        if (tbody) tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 text-muted">Carregando exclusões...</p>
                </td>
            </tr>
        `;
        if (noDataDiv) noDataDiv.classList.add('d-none');
    } else {
        // Não limpa o tbody aqui, só esconde o loading quando os dados chegarem
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
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'} me-2"></i>
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

// ==================== FUNÇÕES PARA CÁLCULO DE ESTATÍSTICAS ====================
function countUniqueEscalaIds(exclusoes) {
    const uniqueIds = new Set();
    exclusoes.forEach(exclusao => {
        if (exclusao.Id) {
            uniqueIds.add(exclusao.Id.toString());
        }
    });
    return uniqueIds.size;
}

function countTotalVagas(exclusoes) {
    return exclusoes.length;
}

function countUniqueMilitares(exclusoes) {
    const uniqueREs = new Set();
    exclusoes.forEach(exclusao => {
        if (exclusao.RE) {
            uniqueREs.add(exclusao.RE.toString());
        }
    });
    return uniqueREs.size;
}

function addStatisticsTooltips(vagasCount, escalasCount, militaresCount) {
    const totalVagasElement = document.getElementById('totalVagas');
    const totalEscalasElement = document.getElementById('totalEscalas');
    const totalMilitaresElement = document.getElementById('totalMilitares');
    
    if (totalVagasElement) {
        totalVagasElement.setAttribute('data-bs-toggle', 'tooltip');
        totalVagasElement.setAttribute('data-bs-placement', 'top');
        totalVagasElement.setAttribute('title', 
            `${vagasCount} registros de exclusão no período filtrado`);
    }
    
    if (totalEscalasElement) {
        totalEscalasElement.setAttribute('data-bs-toggle', 'tooltip');
        totalEscalasElement.setAttribute('data-bs-placement', 'top');
        totalEscalasElement.setAttribute('title', 
            `${escalasCount} escalas diferentes com exclusões`);
    }
    
    if (totalMilitaresElement) {
        totalMilitaresElement.setAttribute('data-bs-toggle', 'tooltip');
        totalMilitaresElement.setAttribute('data-bs-placement', 'top');
        totalMilitaresElement.setAttribute('title', 
            `${militaresCount} militares diferentes com exclusões (REs únicos)`);
    }
    
    // Inicializar tooltips do Bootstrap
    if (typeof bootstrap !== 'undefined') {
        setTimeout(() => {
            const tooltipTriggerList = [].slice.call(
                document.querySelectorAll('[data-bs-toggle="tooltip"]')
            );
            tooltipTriggerList.map(function (tooltipTriggerEl) {
                try {
                    return new bootstrap.Tooltip(tooltipTriggerEl);
                } catch (e) {
                    return null;
                }
            });
        }, 500);
    }
}

// ==================== INICIALIZAÇÃO ====================
// Event listener para quando a página carrega sozinha (não via SPA)
if (!window.location.pathname.includes('app.html')) {
    console.log('📄 exclusoes.html carregando independentemente...');
    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ DOM carregado, iniciando exclusoes...');
        setTimeout(() => {
            if (typeof initExclusoes === 'function') {
                initExclusoes();
            } else {
                console.error('❌ initExclusoes não encontrada como função global');
            }
        }, 100);
    });
}

// Adicionar função global para SPA
window.initExclusoesPage = initExclusoes;

// Exportar funções para SPA
export { initExclusoes };
export default initExclusoes;