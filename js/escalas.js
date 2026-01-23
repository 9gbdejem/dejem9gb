import { database } from './firebase-config.js';
import { checkAuth } from './auth-check.js';
import { ref, get, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// ==================== VARIÁVEIS GLOBAIS ====================
let allEscalas = [];
let filteredEscalas = [];
let currentPage = 1;
const itemsPerPage = 15;
let uniqueStations = new Set();
let uniqueYears = new Set();
let uniqueMonths = new Set();
let uniqueDays = new Set();
let currentSearchType = 'RE';
let confirmacoesCache = {};
let userNivel = 3;
let userRE = '';

// ==================== FUNÇÕES DE INICIALIZAÇÃO ====================
export async function initEscalasSPA() {
    // console.log('📅 Escalas SPA inicializando...');
    await initializeApp();
}

async function initEscalas() {
    // console.log('📅 Página de Escalas carregando...');
    await initializeApp();
    await loadNavbar();
}

async function initializeApp() {
    try {
        // Verificar autenticação - nível mínimo 3 para ver a página
        const { userData, re } = await checkAuth(3);
        
        userRE = re;
        userNivel = userData.nivel || 3;
        
        sessionStorage.setItem('userRE', userRE);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userNivel', userNivel);
        
        if (window.updateUserGreetingInSPA) {
            window.updateUserGreetingInSPA();
        }
        
        // Criar modal dinamicamente
        createModalIfNotExists();
        
        // Configurar tudo
        setupEventListeners();
        await loadEscalados();
        await loadConfirmacoes();
        populateFilters();
        
        // Aplicar filtro do dia atual automaticamente
        applyTodayFilter();
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        showError('Erro ao carregar: ' + error.message);
    }
}

// ==================== FUNÇÕES DE CARREGAMENTO DE DADOS ====================
async function loadEscalados() {
    try {
        showLoading(true);
        
        const escaladosRef = ref(database, 'escalados');
        const snapshot = await get(escaladosRef);
        
        if (snapshot.exists()) {
            allEscalas = [];
            uniqueStations.clear();
            uniqueYears.clear();
            uniqueMonths.clear();
            uniqueDays.clear();
            
            snapshot.forEach((yearSnapshot) => {
                const year = yearSnapshot.key;
                if (isNaN(year)) return;
                
                yearSnapshot.forEach((monthSnapshot) => {
                    const month = monthSnapshot.key;
                    
                    monthSnapshot.forEach((daySnapshot) => {
                        const day = daySnapshot.key;
                        
                        daySnapshot.forEach((escalaSnapshot) => {
                            const escalaKey = escalaSnapshot.key;
                            const escalaData = escalaSnapshot.val();
                            
                            processarEscala(escalaData, year, month, day, escalaKey);
                        });
                    });
                });
            });
            
            // Ordenar por data (mais recente primeiro)
            allEscalas.sort((a, b) => {
                const dateA = new Date(a.ano, a.mês - 1, a.dia);
                const dateB = new Date(b.ano, b.mês - 1, b.dia);
                return dateB - dateA;
            });
            
            // console.log(`✅ ${allEscalas.length} escalas carregadas`);
            
        } else {
            // console.log('📭 Nenhuma escala encontrada');
            allEscalas = [];
            showMessage('Nenhuma escala cadastrada no sistema.', 'info');
        }
        
    } catch (error) {
        console.error('💥 Erro ao carregar escalas:', error);
        showError('Erro ao carregar escalas: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function processarEscala(escalaData, year, month, day, escalaKey) {
    // FILTRAR EXCLUSÕES - NÃO ADICIONAR À LISTA
    if (escalaData.Exclusao === "X" || escalaData.Exclusao === "x") {
        // console.log(`🚫 Exclusão ignorada: ${escalaData.Id || ''}/${escalaData.RE || ''} - ${escalaData.Militar || 'N/A'}`);
        return; // NÃO processa, NÃO adiciona ao allEscalas
    }
    
    const escalaId = escalaData.Id || '';
    const escalaRE = escalaData.RE || '';
    
    const escala = {
        ...escalaData,
        escalaKey: escalaKey,
        ano: parseInt(year),
        mês: parseInt(month),
        dia: parseInt(day),
        Data: `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`,
        Id: escalaId,
        RE: escalaRE,
        linhaId: `${year}/${month}/${day}/${escalaKey}`
    };
    
    // Converter horários
    if (escalaData.HorarioInic !== undefined) {
        escala.horarioInicio = decimalToTime(escalaData.HorarioInic);
    }
    if (escalaData.HorarioTerm !== undefined) {
        escala.horarioTermino = decimalToTime(escalaData.HorarioTerm);
    }
    escala.horarioFormatado = `${escala.horarioInicio || '--:--'} às ${escala.horarioTermino || '--:--'}`;
    
    // Corrigir PostoGrad
    escala.PostoGrad = escalaData.PostoGrad || escalaData.Posto_Grad || '-';
    
    // Adicionar aos conjuntos únicos
    uniqueYears.add(parseInt(year));
    uniqueMonths.add(parseInt(month));
    uniqueDays.add(parseInt(day));
    
    if (escalaData.Estacao) {
        uniqueStations.add(escalaData.Estacao);
    }
    
    allEscalas.push(escala);
}

async function loadConfirmacoes() {
    try {
        // console.log('🔍 Carregando confirmações...');
        const confirmacoesRef = ref(database, 'confirmacoes');
        const snapshot = await get(confirmacoesRef);
        
        confirmacoesCache = {};
        
        if (snapshot.exists()) {
            snapshot.forEach((idSnapshot) => {
                const escalaId = idSnapshot.key;
                confirmacoesCache[escalaId] = {
                    dadosGerais: idSnapshot.child('dados_gerais').val() || {},
                    militares: {}
                };
                
                idSnapshot.forEach((militarSnapshot) => {
                    if (militarSnapshot.key !== 'dados_gerais') {
                        const re = militarSnapshot.key.replace('RE_', '');
                        confirmacoesCache[escalaId].militares[re] = militarSnapshot.val();
                    }
                });
            });
            // console.log(`✅ Confirmações carregadas: ${Object.keys(confirmacoesCache).length} escalas`);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar confirmações:', error);
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

function isValidSEILink(link) {
    if (!link) return false;
    return link.startsWith('https://sei.sp.gov.br/') || link.startsWith('http://sei.sp.gov.br/');
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
    
    // Agrupar escalas por ID para contar e destacar
    const escalasPorId = {};
    filteredEscalas.forEach(escala => {
        if (escala.Id) {
            if (!escalasPorId[escala.Id]) {
                escalasPorId[escala.Id] = [];
            }
            escalasPorId[escala.Id].push(escala);
        }
    });
    
    pageEscalas.forEach((escala, index) => {
        const globalIndex = startIndex + index + 1;
        const isUserEscala = userRE && escala.RE && escala.RE.toString() === userRE;
        
        // Verificar confirmação
        const confirmacao = getConfirmacaoStatus(escala.Id, escala.RE);
        const confirmacaoIcon = getConfirmacaoIcon(confirmacao ? confirmacao.status : null, escala.Id, escala.RE);
        
        // Contar quantos tem mesmo ID
        const countSameId = escala.Id ? (escalasPorId[escala.Id] || []).length : 0;
        
        // Cor de fundo para grupo de mesma ID
        let rowClass = '';
        if (isUserEscala) rowClass += 'table-info ';
        if (countSameId > 1) {
            const idNum = parseInt(escala.Id) || 0;
            rowClass += idNum % 2 === 0 ? 'escala-grupo-par ' : 'escala-grupo-impar ';
        }
        
        // Gerar link para a escala (só para admin nível 1)
        const escalaLink = getEscalaLink(escala.Id);
        const temConfirmacao = confirmacao !== null;
        const temLinkSEI = temConfirmacao && confirmacoesCache[escala.Id]?.dadosGerais?.sei_link;

        // BOTÃO CLIPE (admin) - SÓ aparece se tiver link SEI
        const adminLinkIcon = (userNivel === 1 && escala.Id && temConfirmacao && temLinkSEI) ? 
            `<a href="${confirmacoesCache[escala.Id].dadosGerais.sei_link}" target="_blank" class="btn btn-sm btn-outline-info ms-1" title="Abrir documento SEI">
                <i class="fas fa-paperclip"></i>
            </a>` : '';

        html += `
            <tr class="${rowClass.trim()}" data-escala-id="${escala.Id}" data-escala-re="${escala.RE}">
                <td>
                    <div class="fw-bold">${formatDate(escala.Data)}</div>
                    <small class="text-muted">${getMonthName(escala.mês)}</small>
                </td>
                <td>${escala.horarioFormatado}</td>
                <td>${escala.OPM || '-'}</td>
                <td>
                    <span class="badge bg-secondary">${escala.Estacao || '-'}</span>
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
                    <!-- ID SEMPRE abre link do sistema PM -->
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

function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
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
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
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
};

// ==================== FUNÇÕES DE FILTROS ====================
function setupEventListeners() {
    // Search input
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
    
    // Search type
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
    
    // Filtros
    const dayFilter = document.getElementById('filterDay');
    if (dayFilter) dayFilter.addEventListener('change', applyFilters);
    
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter) monthFilter.addEventListener('change', applyFilters);
    
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter) yearFilter.addEventListener('change', applyFilters);
    
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter) stationFilter.addEventListener('change', applyFilters);
    
    // Botões
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshEscalas);
    
    const exportBtn = document.getElementById('exportExcel');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
    
    const todayBtn = document.getElementById('todayFilter');
    if (todayBtn) todayBtn.addEventListener('click', applyTodayFilter);
    
    const tutorialBtn = document.getElementById('tutorialBtn');
    if (tutorialBtn) {
        tutorialBtn.addEventListener('click', function() {
            window.open('https://www.youtube.com/', '_blank');
        });
    }
    
    // Event listener para botões de confirmação
    document.addEventListener('click', function(e) {
        const confirmBtn = e.target.closest('.confirm-btn');
        if (confirmBtn) {
            const escalaId = confirmBtn.getAttribute('data-escala-id');
            const re = confirmBtn.getAttribute('data-re');
            if (escalaId && re) {
                openConfirmModal(escalaId, re);
            }
        }
    });
    
    // Event listener para salvar confirmação
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'saveConfirm') {
            saveConfirmation();
        }
    });
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

function populateFilters() {
    // Filtro de dias (1-31)
    const dayFilter = document.getElementById('filterDay');
    if (dayFilter) {
        while (dayFilter.options.length > 1) {
            dayFilter.remove(1);
        }
        
        for (let day = 1; day <= 31; day++) {
            const option = document.createElement('option');
            option.value = day;
            option.textContent = day.toString().padStart(2, '0');
            dayFilter.appendChild(option);
        }
    }
    
    // Filtro de meses
    const monthFilter = document.getElementById('filterMonth');
    if (monthFilter && uniqueMonths.size > 0) {
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        const sortedMonths = Array.from(uniqueMonths).sort((a, b) => a - b);
        
        while (monthFilter.options.length > 1) {
            monthFilter.remove(1);
        }
        
        sortedMonths.forEach(month => {
            if (month >= 1 && month <= 12) {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = monthNames[month - 1];
                monthFilter.appendChild(option);
            }
        });
    }
    
    // Filtro de anos
    const yearFilter = document.getElementById('filterYear');
    if (yearFilter && uniqueYears.size > 0) {
        const sortedYears = Array.from(uniqueYears).sort((a, b) => b - a);
        
        while (yearFilter.options.length > 1) {
            yearFilter.remove(1);
        }
        
        sortedYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });
    }
    
    // Filtro de estações
    const stationFilter = document.getElementById('filterStation');
    if (stationFilter && uniqueStations.size > 0) {
        const sortedStations = Array.from(uniqueStations).sort();
        
        while (stationFilter.options.length > 1) {
            stationFilter.remove(1);
        }
        
        sortedStations.forEach(station => {
            const option = document.createElement('option');
            option.value = station;
            option.textContent = station;
            stationFilter.appendChild(option);
        });
    }
}

function applyTodayFilter() {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    // Aplicar filtro do dia atual
    document.getElementById('filterDay').value = day;
    document.getElementById('filterMonth').value = month;
    document.getElementById('filterYear').value = year;
    
    // Verificar se há escalas para o dia atual
    const hasEscalasForToday = allEscalas.some(e => 
        e.dia === day && e.mês === month && e.ano === year
    );
    
    if (!hasEscalasForToday) {
        // Se não tem para o dia, verificar se tem para o mês
        const hasEscalasForMonth = allEscalas.some(e => 
            e.mês === month && e.ano === year
        );
        
        if (!hasEscalasForMonth) {
            // Se não tem para o mês, mostrar a escala mais recente
            if (allEscalas.length > 0) {
                const recente = allEscalas[0];
                document.getElementById('filterDay').value = recente.dia;
                document.getElementById('filterMonth').value = recente.mês;
                document.getElementById('filterYear').value = recente.ano;
                showMessage('Mostrando a escala mais recente disponível', 'info');
            }
        } else {
            // Tem para o mês, remover filtro de dia
            document.getElementById('filterDay').value = '';
            showMessage('Mostrando todas as escalas deste mês', 'info');
        }
    }
    
    applyFilters();
}

function applyFilters() {
    const searchValue = document.getElementById('searchRE').value.trim();
    const dayFilter = document.getElementById('filterDay').value;
    const monthFilter = document.getElementById('filterMonth').value;
    const yearFilter = document.getElementById('filterYear').value;
    const stationFilter = document.getElementById('filterStation').value;
    
    filteredEscalas = allEscalas.filter(escala => {
        // Filtro de busca
        if (searchValue) {
            const searchField = currentSearchType.toLowerCase();
            let fieldValue = '';
            
            switch(currentSearchType) {
                case 'RE':
                    fieldValue = escala.RE ? escala.RE.toString() : '';
                    break;
                case 'Militar':
                    fieldValue = escala.Militar || '';
                    break;
                case 'Estacao':
                    fieldValue = escala.Estacao || '';
                    break;
                case 'Composicao':
                    fieldValue = escala.Composicao || '';
                    break;
                case 'ID':
                    fieldValue = escala.Id ? escala.Id.toString() : '';
                    break;
            }
            
            if (!fieldValue.toLowerCase().includes(searchValue.toLowerCase())) {
                return false;
            }
        }
        
        // Filtro de dia
        if (dayFilter && escala.dia) {
            if (escala.dia.toString() !== dayFilter) {
                return false;
            }
        }
        
        // Filtro de mês
        if (monthFilter && escala.mês) {
            if (escala.mês.toString() !== monthFilter) {
                return false;
            }
        }
        
        // Filtro de ano
        if (yearFilter && escala.ano) {
            if (escala.ano.toString() !== yearFilter) {
                return false;
            }
        }
        
        // Filtro de estação
        if (stationFilter && escala.Estacao) {
            if (escala.Estacao !== stationFilter) {
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
    document.getElementById('filterDay').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterStation').value = '';
    
    currentSearchType = 'RE';
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) searchTypeSelect.value = 'RE';
    
    const searchInput = document.getElementById('searchRE');
    if (searchInput) searchInput.placeholder = 'Filtrar por RE (6 dígitos)';
    
    filteredEscalas = [...allEscalas];
    currentPage = 1;
    renderTable();
    updateStatistics();
    
    showMessage('Filtros limpos com sucesso.', 'success');
}

function refreshEscalas() {
    // console.log('🔄 Atualizando escalas...');
    
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) {
        const originalHTML = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        refreshBtn.disabled = true;
        
        Promise.all([
            loadEscalados(),
            loadConfirmacoes()
        ]).then(() => {
            populateFilters();
            applyTodayFilter(); // Aplicar filtro do dia atual após refresh
        }).finally(() => {
            setTimeout(() => {
                refreshBtn.innerHTML = originalHTML;
                refreshBtn.disabled = false;
                showMessage('Dados atualizados com sucesso', 'success');
            }, 500);
        });
    } else {
        Promise.all([
            loadEscalados(),
            loadConfirmacoes()
        ]).then(() => {
            populateFilters();
            applyTodayFilter();
        });
    }
}

function updateStatistics() {
    const totalEscalas = document.getElementById('totalEscalas');
    const totalEstacoes = document.getElementById('totalEstacoes');
    const totalMilitares = document.getElementById('totalMilitares');
    const mesAtual = document.getElementById('mesAtual');
    const anoAtual = document.getElementById('anoAtual');
    
    if (!totalEscalas || !totalEstacoes || !totalMilitares || !mesAtual || !anoAtual) return;
    
    totalEscalas.textContent = filteredEscalas.length;
    totalEstacoes.textContent = getUniqueStationsCount();
    totalMilitares.textContent = getUniqueMilitaresCount();
    
    const monthFilter = document.getElementById('filterMonth');
    const yearFilter = document.getElementById('filterYear');
    
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                       'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (monthFilter && monthFilter.value) {
        const monthNum = parseInt(monthFilter.value);
        mesAtual.textContent = monthNames[monthNum - 1] || monthNum;
    } else {
        mesAtual.textContent = '-';
    }
    
    if (yearFilter && yearFilter.value) {
        anoAtual.textContent = yearFilter.value;
    } else {
        anoAtual.textContent = '-';
    }
}

function getUniqueStationsCount() {
    const stations = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.Estacao) stations.add(escala.Estacao);
    });
    return stations.size;
}

function getUniqueMilitaresCount() {
    const militares = new Set();
    filteredEscalas.forEach(escala => {
        if (escala.RE) {
            militares.add(escala.RE.toString());
        }
    });
    return militares.size;
}

// ==================== FUNÇÕES DE MODAL ====================
function createModalIfNotExists() {
    if (document.getElementById('confirmModal')) {
        return;
    }
    
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
    // console.log('✅ Modal criado dinamicamente');
}

window.openConfirmModal = async function(escalaId, reClicado) {
    // console.log('Abrindo modal para escala ID:', escalaId, 'RE clicado:', reClicado);
    
    const escalasComMesmoId = allEscalas.filter(e => e.Id == escalaId);
    const usuarioEstaNaEscala = escalasComMesmoId.some(e => e.RE == userRE);
    const isAdmin = userNivel === 1;
    
    // VERIFICAÇÃO DE PERMISSÃO
    if (!usuarioEstaNaEscala && !isAdmin) {
        showMessage('Você não tem permissão para confirmar esta escala.', 'warning');
        return;
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
                    <p><strong><i class="fas fa-map-marker-alt me-1"></i> Estação:</strong> ${primeiraEscala.Estacao || '-'}</p>
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
    
    // Para cada militar, criar linha com status EDITÁVEL
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
    if (!confirmContent) {
        console.error('❌ Elemento #confirmContent não encontrado');
        return;
    }
    
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
    
    // Validar formato do link SEI
    if (!isValidSEILink(seiLink)) {
        showMessage('O link do SEI deve começar com https://sei.sp.gov.br/ ou http://sei.sp.gov.br/', 'warning');
        return;
    }
    
    // Coletar status de TODOS os militares
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
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando...';
        saveBtn.disabled = true;
        
        const timestamp = Date.now();
        
        // 1. Salvar dados gerais
        await set(ref(database, `confirmacoes/${escalaId}/dados_gerais`), {
            sei_link: seiLink,
            observacoes: document.getElementById('observacoes')?.value.trim() || '',
            ultima_atualizacao: timestamp,
            atualizado_por: userRE
        });
        
        // 2. Salvar status de cada militar que tem status selecionado
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
        
        // 3. Atualizar cache
        if (!confirmacoesCache[escalaId]) {
            confirmacoesCache[escalaId] = { dadosGerais: {}, militares: {} };
        }
        
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
        
        // 4. Fechar modal e atualizar
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

// ==================== FUNÇÕES DE EXPORTAÇÃO ====================
function exportToExcel() {
    try {
        if (filteredEscalas.length === 0) {
            showMessage('Nenhum dado para exportar!', 'warning');
            return;
        }
        
        const wsData = filteredEscalas.map(escala => {
            const confirmacao = getConfirmacaoStatus(escala.Id, escala.RE);
            
            return {
                'Data': escala.Data || '',
                'Horário': escala.horarioFormatado || '',
                'OPM': escala.OPM || '',
                'Estação': escala.Estacao || '',
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
            {wch: 10}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 20},
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

// ==================== FUNÇÕES DE UI/HELPERS ====================
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