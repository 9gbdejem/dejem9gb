// js/solicitacoes.js - Versão Completa com Cloudinary

// Status_Inicial
// vazio = aguardando processamento (usuário)
// 5 = excluido (usuário)
// 4 = editado (usuário)
// 3 = cancelado (administrador) se no 'Status_Adm' estiver 2, no 'Status_Inicial' ficará 3
// 2 = exportado (administrador)
// 1 = aprovado (administrador) significa que o nó 'Status_Adm' não está vazio e tem valor 1, ou seja, foi aprovado e cadastrado no sistema local

// Status_Adm - esses valores sempre vem do sistema local, sendo enviados ao nó 'solicitacoes/ano/mes/opm/composicao/id_solicitacao/Status_Adm';
// os dados somente são enviados ao Firebase se na coluna 'Alteracao' do sistema local estiver com valor 1
// 1 = aprovado, aguardando cadastro na Intranet
// 2 = cancelado pelo administrador
// 3 = cadastrado na Intranet (tem ID_Escala e Prazo_Inscricao), aguardando montar
// 4 = montado e divulgado, aguardando pagamento
// 5 = pago
// 6 = aguardando comprovante para o administrador pagar

import { checkAuth } from './auth-check.js';
import { auth, database } from './firebase-config.js';
import {
    ref, get, set, update, push, child, remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { uploadParaCloudinary, gerarNomeArquivoCloudinary } from './cloudinary-config.js';

// Configurações globais
function escaparHTML(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

let userDataCache = null;
let userRE = null;
let opmsPermitidas = [];
let opmsNomes = {};
let opmFiltrosEspeciais = {};
let composicoesDisponiveis = {};
let solicitacoesCache = [];
let opmSelecionada = null;
let mesFiltro = null;
let anoFiltro = null;
let filtrosCarregados = false;
let filtrosTabelaSolicitacoes = {
    composicaoCodigos: [],
    diaInicial: '',
    diaFinal: '',
    status: []
};

// ✅ Constantes do sistema
const BASE_URL_ANEXOS = 'https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/';

// ✅ Variáveis de controle de anexos
let anexosExistentesCache = {};
let usarAnexoExistente = false;
let anexoExistenteSelecionado = null;

function normalizarSolicitacaoFirebase(dados = {}) {
    return {
        ...dados,
        Status_Inicial: dados.Status_Inicial ?? dados.status ?? null,
        solic_subten_sgt: Number(dados.Solic_Subten_Sgt ?? dados.solic_subten_sgt ?? dados.vagas_subten_sgt ?? 0),
        solic_cb_sd: Number(dados.Solic_Cb_Sd ?? dados.solic_cb_sd ?? dados.vagas_cb_sd ?? 0),
        solic_superior: Number(dados.Solic_Superior ?? dados.solic_superior ?? 0),
        solic_intermed: Number(dados.Solic_Intermed ?? dados.solic_intermed ?? 0),
        solic_subalterno: Number(dados.Solic_Subalterno ?? dados.solic_subalterno ?? 0),
        atz_superior: dados.Atz_Superior ?? dados.atz_superior ?? null,
        atz_intermed: dados.Atz_Intermed ?? dados.atz_intermed ?? null,
        atz_subalterno: dados.Atz_Subalterno ?? dados.atz_subalterno ?? null,
        atz_subten_sgt: dados.Atz_Subten_Sgt ?? dados.atz_subten_sgt ?? null,
        atz_cb_sd: dados.Atz_Cb_Sd ?? dados.atz_cb_sd ?? null,
        ID_Firebase: dados.ID_Firebase || dados.id_firebase || '',
        ID_Escala: dados.ID_Escala || dados.id_sistema_local || '',
        Prazo_Inscricao: dados.Prazo_Inscricao || dados.prazo_inscricao || '',
        necessidade: dados.necessidade ?? '',
        pedido_liberacao_edicao: dados.pedido_liberacao_edicao || null,
        liberacao_quantidade: dados.liberacao_quantidade || null,
        esc_superior: Number(dados.Esc_Superior ?? dados.esc_superior ?? 0),
        esc_intermed: Number(dados.Esc_Intermed ?? dados.esc_intermed ?? 0),
        esc_subalterno: Number(dados.Esc_Subalterno ?? dados.esc_subalterno ?? 0),
        esc_subten_sgt: Number(dados.Esc_Subten_Sgt ?? dados.escalado_subten_sgt ?? 0),
        esc_cb_sd: Number(dados.Esc_Cb_Sd ?? dados.escalado_cb_sd ?? 0)
    };
}

function quantidadeAutorizadaOuSolicitada(solicitacao, campoAutorizado, campoSolicitado) {
    const autorizada = solicitacao[campoAutorizado];
    if (autorizada === null || autorizada === undefined || autorizada === '') {
        return Number(solicitacao[campoSolicitado] || 0);
    }
    return Number(autorizada || 0);
}

function exibirQuantidadeSolicitadaAutorizada(solicitacao, campoSolicitado, campoAutorizado) {
    const solicitada = Number(solicitacao[campoSolicitado] || 0);
    const autorizada = solicitacao[campoAutorizado];

    if (autorizada === null || autorizada === undefined || autorizada === '') {
        return String(solicitada);
    }

    const autorizadaNumero = Number(autorizada || 0);
    return solicitada === autorizadaNumero
        ? String(solicitada)
        : `<span class="quantidade-autorizada" title="Solicitada: ${solicitada} | Autorizada: ${autorizadaNumero}">${solicitada}(${autorizadaNumero})</span>`;
}

function dataEscalaAindaNaoPassou(solicitacao) {
    const inicioEscala = obterDataHoraInicioEscala(solicitacao);
    if (!(inicioEscala instanceof Date) || isNaN(inicioEscala.getTime())) return false;

    // Em dias futuros, a escala permanece elegível. No dia atual,
    // somente até o horário de início.
    return inicioEscala.getTime() >= Date.now();
}

function podeSolicitarLiberacaoQuantidade(solicitacao) {
    const nivel = Number(userDataCache?.nivel || 0);
    const statusAdm = Number(solicitacao.Status_Adm || 0);
    const statusInicial = Number(solicitacao.Status_Inicial ?? solicitacao.status ?? 0);
    const temPermissaoOpm = nivel === 1 || (nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo));

    return (nivel === 1 || nivel === 2) && temPermissaoOpm &&
        [1, 2, 3, 4, 8].includes(statusAdm) &&
        statusInicial !== 5 &&
        dataEscalaAindaNaoPassou(solicitacao) &&
        !solicitacao.pedido_liberacao_edicao &&
        !solicitacao.liberacao_quantidade;
}

function chavePedidoLiberacao(idFirebase) {
    return String(idFirebase || '').replaceAll('/', '_');
}

function obterAnoMesSolicitacao(solicitacao) {
    const partes = String(solicitacao?.id || solicitacao?.ID_Firebase || '')
        .replace(/^\/?solicitacoes\//, '')
        .split('/');

    if (/^\d{4}$/.test(partes[0] || '') && /^\d{1,2}$/.test(partes[1] || '')) {
        return {
            ano: partes[0],
            mes: String(partes[1]).padStart(2, '0')
        };
    }

    const dataEscala = obterDataSolicitacaoTabela(solicitacao);
    if (!dataEscala) return null;

    return {
        ano: String(dataEscala.getFullYear()),
        mes: String(dataEscala.getMonth() + 1).padStart(2, '0')
    };
}

// Hierarquia militar para ordenação
const HIERARQUIA_MILITAR = {
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

// Legendas dos status
function getTooltipStatus(status) {
    switch(status) {
        case 1: return '✅ Aprovado/cadastrado no sistema local';
        case 2: return '⚠️ Exportado/baixado para sistema local';
        case 3: return '❌ Cancelado pelo administrador';
        case 4: return 'Em edição pelo usuário';
        case 5: return 'Marcado para exclusão pelo usuário';
        default: return '📝 Aguardando processamento';
    }
}

// FUNÇÃO: Gerar ID hierárquico
function gerarIdHierarquico(data, opm, composicao, horario) {
    try {
        const dataObj = new Date(data);
        const ano = dataObj.getFullYear();
        const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
        const dia = String(dataObj.getDate()).padStart(2, '0');

        const [hora, minuto] = horario.split(':');

        return `${ano}/${mes}/${opm}/${composicao}/${dia}${hora}${minuto}`;
    } catch (error) {
        console.error('Erro ao gerar ID hierárquico:', error);
        throw error;
    }
}

// FUNÇÃO: Converter ID antigo para novo formato
function converterIdAntigoParaNovo(idAntigo) {
    try {
        const opm = idAntigo.substring(0, 9);
        let restante = idAntigo.substring(9);

        let i = 0;
        while (i < restante.length && !/^[2-9]/.test(restante[i])) {
            i++;
        }

        const composicao = restante.substring(0, i);
        const dataHora = restante.substring(i);

        const ano = dataHora.substring(0, 4);
        const mes = dataHora.substring(4, 6);
        const dia = dataHora.substring(6, 8);
        const hora = dataHora.substring(8, 10);
        const minuto = dataHora.substring(10, 12);

        return `${ano}/${mes}/${opm}/${composicao}/${dia}${hora}${minuto}`;
    } catch (error) {
        console.warn('Erro ao converter ID antigo:', idAntigo, error);
        return null;
    }
}

// Exportar funções para SPA
export async function initSolicitacoesSPA() {
    console.log('🚀 Solicitações inicializando (SPA)...');
    await initSolicitacoes();
}

export async function initSolicitacoes() {
    try {
        const { userData, re } = await checkAuth(2);
        userDataCache = userData;
        userRE = re;
        filtrosCarregados = false;

        let opmParam = null, mesParam = null, anoParam = null;
        let statusFiltroNavbar = [];

        if (window.app && window.app.spaParams) {
            opmParam = window.app.spaParams.opm;
            mesParam = window.app.spaParams.mes;
            anoParam = window.app.spaParams.ano;
        } else if (window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            opmParam = urlParams.get('opm');
            mesParam = urlParams.get('mes');
            anoParam = urlParams.get('ano');
        }

        const filtroNavbar = sessionStorage.getItem('filtroSolicitacoesTeste');
        if (filtroNavbar) {
            try {
                const filtro = JSON.parse(filtroNavbar);
                opmParam = filtro.opm || opmParam;
                mesParam = filtro.mes || mesParam;
                anoParam = filtro.ano || anoParam;
                statusFiltroNavbar = Array.isArray(filtro.status) ? filtro.status : [];
                filtrosTabelaSolicitacoes.status = statusFiltroNavbar;
            } catch (error) {
                console.warn('Não foi possível recuperar o filtro do navbar:', error);
            }
            sessionStorage.removeItem('filtroSolicitacoesTeste');
        }

        // Ao abrir normalmente, não reaproveita a OPM de uma visita anterior:
        // o usuário deve confirmar os filtros pelo botão Carregar.
        if (opmParam) {
            opmSelecionada = opmParam;
        } else {
            opmSelecionada = null;
        }
        if (mesParam) mesFiltro = parseInt(mesParam);
        if (anoParam) anoFiltro = parseInt(anoParam);

        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', userData.nome);
        sessionStorage.setItem('userLevel', userData.nivel);

        if (window.updateUserGreetingInSPA) window.updateUserGreetingInSPA();
        if (window.updateNavbarByLevel) window.updateNavbarByLevel(userData.nivel);

        await carregarDadosIniciais();

        renderInterface();

        if (statusFiltroNavbar.length > 0) {
            filtrosTabelaSolicitacoes.status = statusFiltroNavbar;
        }

        // A navegação pelo sino/sirene fornece filtros explícitos e mantém o
        // carregamento automático desse atalho administrativo.
        if (opmParam && opmSelecionada) {
            await carregarSolicitacoesMes();
            filtrosCarregados = true;
            await atualizarTabelaSolicitacoes();
            atualizarComposicoesDropdown();
            document.getElementById('tabelaSolicitacoes')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }

        console.log('✅ Sistema de Solicitações carregado');

    } catch (error) {
        console.error('❌ Erro nas solicitações:', error);
        showSolicitacoesError(error);
    }
}

// Carregar dados iniciais
async function carregarDadosIniciais() {
    try {
        if (userDataCache.nivel === 1) {
            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);

            if (localSnapshot.exists()) {
                opmsPermitidas = Object.keys(localSnapshot.val());
                opmsNomes = localSnapshot.val();
            }
        } else {
            const permissaoRef = ref(database, `permissoes/${userRE}/opms`);
            const permissaoSnapshot = await get(permissaoRef);

            if (permissaoSnapshot.exists()) {
                const opms = permissaoSnapshot.val() || {};
                opmsPermitidas = Object.entries(opms)
                    .filter(([, permitido]) => permitido === true)
                    .map(([codigo]) => codigo);
            }

            const localRef = ref(database, 'local');
            const localSnapshot = await get(localRef);

            if (localSnapshot.exists()) {
                opmsNomes = localSnapshot.val();
            }
        }

        if (opmsPermitidas.length === 0) {
            throw new Error('Nenhuma OPM permitida para seu usuário');
        }

        const hoje = new Date();
        mesFiltro = mesFiltro || hoje.getMonth() + 1;
        anoFiltro = anoFiltro || hoje.getFullYear();

        prepararOpcoesEspeciaisOpm();

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        throw error;
    }
}

// FUNÇÃO: Carregar solicitações do mês
async function carregarSolicitacoesMes() {
    try {
        solicitacoesCache = [];

        if (!opmSelecionada) {
            console.log('⚠️ Nenhuma OPM selecionada');
            const tbody = document.getElementById('tbodySolicitacoes');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="20" class="text-center py-4 text-muted">
                            <i class="fas fa-hand-pointer fa-2x mb-3"></i><br>
                            Selecione uma OPM para carregar as solicitações
                        </td>
                    </tr>
                `;
            }
            return;
        }

        const mesStr = mesFiltro.toString().padStart(2, '0');
        const anoStr = anoFiltro.toString();
        const opmsParaBuscar = obterOpmsDaSelecao();
        const filtroOficiais = opmSelecionada === '__OFICIAIS__';

        // No teste, as composições só são carregadas depois que o usuário solicitar a atualização.
        await Promise.all(opmsParaBuscar.map(async (opm) => {
            try {
                const opmSnapshot = await get(ref(database, `LocalOPM/${opm}`));
                if (opmSnapshot.exists()) {
                    composicoesDisponiveis[opm] = opmSnapshot.val() || {};
                }
            } catch (error) {
                console.warn(`Não foi possível carregar composições da OPM ${opm}:`, error);
            }
        }));

        try {
            for (const opmCodigo of opmsParaBuscar) {
                const caminhoBase = `solicitacoes/${anoStr}/${mesStr}/${opmCodigo}`;
                const snapshot = await get(ref(database, caminhoBase));

            if (snapshot.exists()) {
                snapshot.forEach((composicaoSnapshot) => {
                    const composicaoCod = composicaoSnapshot.key;

                    if (composicaoCod === 'anexos') return;

                    composicaoSnapshot.forEach((solicitacaoSnapshot) => {
                        const idSolicitacao = solicitacaoSnapshot.key;
                        const dados = solicitacaoSnapshot.val();

                        if (!idSolicitacao || !/^\d{6}$/.test(idSolicitacao)) return;

                        const dataInfo = extrairDataDoIdHierarquico(anoStr, mesStr, idSolicitacao);

                        if (dataInfo) {
                            const dadosNormalizados = normalizarSolicitacaoFirebase(dados);
                            const nomeComposicao = String(dadosNormalizados.composicao_nome || '').toLowerCase();
                            if (filtroOficiais && !nomeComposicao.includes('oficial')) return;

                            const idCompleto = `${anoStr}/${mesStr}/${opmCodigo}/${composicaoCod}/${idSolicitacao}`;

                            solicitacoesCache.push({
                                id: idCompleto,
                                id_simplificado: idSolicitacao,
                                ...dadosNormalizados,
                                opm_codigo: opmCodigo,
                                opm_nome: opmsNomes[opmCodigo] || opmCodigo,
                                composicao_cod: composicaoCod,
                                data_extraida: dataInfo.data,
                                data_local: dataInfo.data_local
                            });
                        }
                    });
                });
            }
            }

        } catch (error) {
            console.error('❌ Erro na busca:', error);
            await carregarSolicitacoesMesFallback();
        }

        const solicitacoesUnicas = [];
        const idsVistos = new Set();

        solicitacoesCache.forEach(s => {
            if (!idsVistos.has(s.id) && s.data && s.id_simplificado && /^\d{6}$/.test(s.id_simplificado)) {
                idsVistos.add(s.id);
                solicitacoesUnicas.push(s);
            }
        });

        solicitacoesCache = solicitacoesUnicas;

        solicitacoesCache.sort((a, b) => {
            try {
                const dataA = obterDataHoraInicioEscala(a);
                const dataB = obterDataHoraInicioEscala(b);

                if (isNaN(dataA.getTime()) || isNaN(dataB.getTime())) return 0;
                return dataA - dataB;
            } catch {
                return 0;
            }
        });

    } catch (error) {
        console.error('Erro ao carregar solicitações:', error);
    }
}

function obterDataHoraInicioEscala(solicitacao) {
    const data = String(solicitacao?.data || solicitacao?.data_extraida || '').trim();
    const horario = String(solicitacao?.horario_inicial || '00:00').trim();
    const dataHora = new Date(`${data}T${horario}:00`);

    if (!isNaN(dataHora.getTime())) return dataHora;
    if (solicitacao?.data_local instanceof Date) return solicitacao.data_local;
    return new Date(solicitacao?.data_local || data);
}

// FUNÇÃO: Extrair data do ID hierárquico
function obterPrefixoOpm(nome) {
    const texto = String(nome || '').trim();
    const indiceTraco = texto.indexOf(' - ');
    return indiceTraco > 0 ? texto.substring(0, indiceTraco).trim() : '';
}

function prepararOpcoesEspeciaisOpm() {
    opmFiltrosEspeciais = {};

    if (userDataCache?.nivel === 1) {
        opmFiltrosEspeciais.__OFICIAIS__ = [];
    }

    const grupos = new Map();
    opmsPermitidas.forEach((codigo) => {
        const prefixo = obterPrefixoOpm(opmsNomes[codigo]);
        if (!prefixo) return;
        if (!grupos.has(prefixo)) grupos.set(prefixo, []);
        grupos.get(prefixo).push(codigo);
    });

    grupos.forEach((codigos, prefixo) => {
        if (codigos.length > 1) {
            opmFiltrosEspeciais[`__GRUPO__${prefixo}`] = codigos;
        }
    });
}

function obterOpmsDaSelecao() {
    if (opmSelecionada === '__OFICIAIS__' && userDataCache?.nivel === 1) {
        return opmsPermitidas;
    }
    if (opmFiltrosEspeciais[opmSelecionada]) return opmFiltrosEspeciais[opmSelecionada];
    return opmsPermitidas.includes(opmSelecionada) ? [opmSelecionada] : [];
}

function extrairDataDoIdHierarquico(ano, mes, diaHoraMinuto) {
    try {
        if (!diaHoraMinuto || diaHoraMinuto.length !== 6) return null;

        const dia = diaHoraMinuto.substring(0, 2);
        const hora = diaHoraMinuto.substring(2, 4);
        const minuto = diaHoraMinuto.substring(4, 6);

        const diaInt = parseInt(dia);
        const horaInt = parseInt(hora);
        const minutoInt = parseInt(minuto);
        const anoInt = parseInt(ano);
        const mesInt = parseInt(mes);

        if (isNaN(diaInt) || isNaN(horaInt) || isNaN(minutoInt) || isNaN(anoInt) || isNaN(mesInt)) return null;

        const dataLocal = new Date(anoInt, mesInt - 1, diaInt, horaInt, minutoInt, 0, 0);

        if (isNaN(dataLocal.getTime())) return null;

        const dataStr = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

        return {
            data: dataStr,
            data_completa: `${dataStr} ${hora}:${minuto}`,
            data_local: dataLocal,
            ano: anoInt,
            mes: mesInt,
            dia: diaInt,
            hora: horaInt,
            minuto: minutoInt
        };
    } catch (error) {
        return null;
    }
}

// FUNÇÃO: Fallback para estrutura antiga
async function carregarSolicitacoesMesFallback() {
    console.log('🔄 Usando fallback para estrutura antiga...');

    try {
        const solicitacoesRef = ref(database, 'solicitacoes');
        const snapshot = await get(solicitacoesRef);

        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([id, dados]) => {
                try {
                    const idOpm = id.substring(0, 9);

                    if (idOpm === opmSelecionada) {
                        const idNovo = converterIdAntigoParaNovo(id);

                        if (idNovo) {
                            const partes = idNovo.split('/');
                            const anoParte = partes[0];
                            const mesParte = partes[1];

                            if (parseInt(mesParte) === mesFiltro && parseInt(anoParte) === anoFiltro) {
                                const dataInfo = extrairDataDoIdHierarquico(anoParte, mesParte, partes[4]);

                                if (dataInfo) {
                                    solicitacoesCache.push({
                                        id: idNovo,
                                        id_antigo: id,
                                        ...normalizarSolicitacaoFirebase(dados),
                                        opm_codigo: opmSelecionada,
                                        opm_nome: opmsNomes[opmSelecionada] || opmSelecionada,
                                        data_extraida: dataInfo.data,
                                        data_local: dataInfo.data_local
                                    });

                                    migrarParaNovaEstrutura(id, dados, idNovo);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Erro ao processar solicitação ${id}:`, error);
                }
            });
        }
    } catch (error) {
        console.error('Erro no fallback:', error);
    }
}

// FUNÇÃO: Migrar para nova estrutura
async function migrarParaNovaEstrutura(idAntigo, dados, idNovo) {
    try {
        console.log(`🔄 Migrando ${idAntigo} → ${idNovo}`);

        const novaRef = ref(database, `solicitacoes/${idNovo}`);
        await set(novaRef, dados);

        console.log(`Migração concluída: ${idAntigo}`);
    } catch (error) {
        console.error(`Erro na migração de ${idAntigo}:`, error);
    }
}

// FUNÇÃO: Carregar notificações do nó SolicPendentes
export async function carregarNotificacoesAdmin() {
    try {
        const userLevel = sessionStorage.getItem('userLevel');
        if (userLevel !== '1') return;

        const listaNotificacoes = document.getElementById('lista-notificacoes');
        if (!listaNotificacoes) return;

        listaNotificacoes.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-warning"></div>
                <p class="small text-muted mt-2">Buscando pendências...</p>
            </div>
        `;

        const pendentesRef = ref(database, 'SolicPendentes');
        const snapshot = await get(pendentesRef);

        const opmsComPendencias = [];
        const gruposPendencias = {};
        const adicionarPendencia = ({ ano, mes, opmCodigo, opmNome, path }) => {
            if (!ano || !mes || !opmCodigo || !path) return;

            const mesNormalizado = String(mes).padStart(2, '0');
            const anoMes = `${ano}${mesNormalizado}`;
            const chaveGrupo = `${opmCodigo}_${anoMes}`;

            if (!gruposPendencias[chaveGrupo]) {
                gruposPendencias[chaveGrupo] = {
                    codigo: opmCodigo,
                    titulo: opmNome || opmsNomes[opmCodigo] || opmCodigo,
                    ano: parseInt(ano),
                    mes: parseInt(mesNormalizado),
                    mesFormatado: nomesMes?.[mesNormalizado] || `mes ${mesNormalizado}`,
                    anoMes,
                    pendentes: 0,
                    paths: []
                };
            }

            gruposPendencias[chaveGrupo].pendentes++;
            gruposPendencias[chaveGrupo].paths.push(path);
        };
        const nomesMes = {
            '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
            '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
            '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
        };

        if (snapshot.exists()) {
            snapshot.forEach((opmSnapshot) => {
                const opmCodigo = opmSnapshot.key;

                if (/^\d{4}$/.test(opmCodigo)) {
                    const ano = opmCodigo;

                    opmSnapshot.forEach((mesSnapshot) => {
                        const mes = mesSnapshot.key;

                        mesSnapshot.forEach((opmNovaSnapshot) => {
                            const opmCodigoNovo = opmNovaSnapshot.key;

                            opmNovaSnapshot.forEach((composicaoSnapshot) => {
                                const composicaoCod = composicaoSnapshot.key;

                                composicaoSnapshot.forEach((solicitacaoSnapshot) => {
                                    const diaHora = solicitacaoSnapshot.key;
                                    const dadosPendencia = solicitacaoSnapshot.val() || {};

                                    adicionarPendencia({
                                        ano,
                                        mes,
                                        opmCodigo: opmCodigoNovo,
                                        opmNome: dadosPendencia.opm_nome,
                                        path: `SolicPendentes/${ano}/${mes}/${opmCodigoNovo}/${composicaoCod}/${diaHora}`
                                    });
                                });
                            });
                        });
                    });
                    return;
                }

                opmSnapshot.forEach((mesSnapshot) => {
                    const anoMes = mesSnapshot.key;
                    const dadosPendencia = mesSnapshot.val();

                    const tituloOPM = dadosPendencia.tituloOPM || opmsNomes[opmCodigo] || opmCodigo;
                    const ano = anoMes.substring(0, 4);
                    const mes = anoMes.substring(4, 6);
                    const nomeMes = nomesMes[mes] || `mês ${mes}`;

                    opmsComPendencias.push({
                        codigo: opmCodigo,
                        titulo: tituloOPM,
                        ano: parseInt(ano),
                        mes: parseInt(mes),
                        mesFormatado: nomeMes,
                        anoMes: anoMes,
                        pendentes: dadosPendencia.total || 1,
                        paths: [`SolicPendentes/${opmCodigo}/${anoMes}`]
                    });
                });
            });
        }

        opmsComPendencias.push(...Object.values(gruposPendencias));

        opmsComPendencias.sort((a, b) => {
            if (a.codigo !== b.codigo) return a.codigo.localeCompare(b.codigo);
            return b.anoMes.localeCompare(a.anoMes);
        });

        if (opmsComPendencias.length === 0) {
            listaNotificacoes.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-check-circle text-success fa-2x mb-2"></i>
                    <p class="small text-muted">Nenhuma pendência encontrada</p>
                    <p class="small text-muted mt-1">Todas as solicitações estáo processadas</p>
                </div>
            `;
        } else {
            let html = '';
            opmsComPendencias.forEach((opm, index) => {
                const isUltima = index === opmsComPendencias.length - 1;
                const tituloFormatado = `${opm.titulo} - ${opm.mesFormatado} de ${opm.ano}`;

                html += `
                    <div class="dropdown-item notificacao-item py-2 px-3 border-bottom" data-opm="${opm.codigo}" data-ano="${opm.ano}" data-mes="${opm.mes}">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1" style="cursor: pointer;" onclick="window.aplicarFiltrosSolicitacoes('${opm.codigo}', ${opm.mes}, ${opm.ano})">
                                <strong class="d-block">${tituloFormatado}</strong>
                                <small class="text-muted">${opm.pendentes} pendência(s)</small>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-outline-danger rounded-circle excluir-pendencia"
                                        data-paths='${JSON.stringify(opm.paths)}'
                                        data-titulo="${tituloFormatado}"
                                        title="Marcar como resolvida"
                                        style="width: 32px; height: 32px; padding: 0;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${!isUltima ? '<div class="dropdown-divider my-0"></div>' : ''}
                `;
            });
            listaNotificacoes.innerHTML = html;

            document.querySelectorAll('.excluir-pendencia').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const paths = JSON.parse(btn.dataset.paths || '[]');
                    const titulo = btn.dataset.titulo;

                    if (confirm(`Confirmar que a pendência "${titulo}" foi resolvida?\nEsta ação não pode ser desfeita.`)) {
                        await excluirPendencia(paths);
                    }
                });
            });
        }

        if (window.atualizarBadgeNotificacoes) {
            window.atualizarBadgeNotificacoes(opmsComPendencias.length);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar notificações:', error);
        const listaNotificacoes = document.getElementById('lista-notificacoes');
        if (listaNotificacoes) {
            listaNotificacoes.innerHTML = `
                <div class="text-center py-3">
                    <i class="fas fa-exclamation-triangle text-danger fa-2x mb-2"></i>
                    <p class="small text-danger">Erro ao carregar notificações</p>
                    <p class="small text-muted">${error.message}</p>
                </div>
            `;
        }
    }
}

// FUNÇÃO: Excluir pendência
async function excluirPendencia(paths) {
    try {
        const btn = event?.target?.closest('.excluir-pendencia');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        const pathsParaExcluir = Array.isArray(paths) ? paths : [paths];
        const updates = {};

        pathsParaExcluir
            .filter(path => typeof path === 'string' && path.trim() !== '')
            .forEach(path => {
                updates[path] = null;
            });

        if (Object.keys(updates).length === 0) return;

        await update(ref(database), updates);
        const path = Object.keys(updates).join(', ');

        console.log(`✅ Pendência removida: ${path}`);

        await carregarNotificacoesAdmin();

        const mensagensDiv = document.getElementById('mensagensForm');
        if (mensagensDiv) {
            mensagensDiv.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show">
                    ✅ Pendência marcada como resolvida!
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
            setTimeout(() => {
                const alert = mensagensDiv.querySelector('.alert');
                if (alert) alert.remove();
            }, 3000);
        }

    } catch (error) {
        console.error('❌ Erro ao excluir pendência:', error);
        alert('Erro ao excluir pendência: ' + error.message);
    }
}

// FUNÇÃO: Extrair data sem fuso
function extrairDataSemFuso(dataStr) {
    if (!dataStr) return null;

    let ano, mes, dia;

    if (dataStr.includes('-')) {
        const partes = dataStr.split('-');
        if (partes.length >= 3) {
            ano = parseInt(partes[0]);
            mes = partes[1].padStart(2, '0');
            dia = partes[2].substring(0, 2).padStart(2, '0');
        }
    } else if (dataStr.includes('/')) {
        const partes = dataStr.split('/');
        if (partes.length >= 3) {
            dia = partes[0].padStart(2, '0');
            mes = partes[1].padStart(2, '0');
            ano = parseInt(partes[2]);
        }
    } else if (dataStr.includes('-') && dataStr.split('-')[0].length <= 2) {
        const partes = dataStr.split('-');
        if (partes.length >= 3) {
            dia = partes[0].padStart(2, '0');
            mes = partes[1].padStart(2, '0');
            ano = parseInt(partes[2]);
        }
    }

    if (ano && ano < 100) ano = 2000 + ano;

    if (ano && mes && dia) {
        return { ano, mes, dia };
    }

    return null;
}

// FUNÇÃO: Verificar anexos existentes (MODIFICADA - retorna URLs)
async function verificarAnexosExistentes(ano, mes, opmCodigo, composicaoCod) {
    const cacheKey = `${ano}-${mes}-${opmCodigo}-${composicaoCod}`;

    if (anexosExistentesCache[cacheKey]) {
        return anexosExistentesCache[cacheKey];
    }

    try {
        const caminhoAnexos = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos`;
        const anexosRef = ref(database, caminhoAnexos);
        const snapshot = await get(anexosRef);

        const anexos = [];
        let proximoNumero = 1;

        if (snapshot.exists()) {
            Object.entries(snapshot.val()).forEach(([numeroAnexo, dadosAnexo]) => {
                if (/^\d{2}$/.test(numeroAnexo)) {
                    anexos.push({
                        numero: numeroAnexo,
                        url: dadosAnexo.url,
                        nome_sistema: dadosAnexo.nome_sistema,
                        upload_por_re: dadosAnexo.upload_por_re,
                        upload_por_nome: dadosAnexo.upload_por_nome,
                        upload_em: dadosAnexo.upload_em
                    });

                    const num = parseInt(numeroAnexo);
                    if (num >= proximoNumero) proximoNumero = num + 1;
                }
            });

            anexos.sort((a, b) => parseInt(a.numero) - parseInt(b.numero));
        }

        anexosExistentesCache[cacheKey] = {
            anexos: anexos,
            proximoNumero: proximoNumero.toString().padStart(2, '0'),
            temAnexos: anexos.length > 0
        };

        console.log(`📎 Anexos encontrados: ${anexos.length}`);
        return anexosExistentesCache[cacheKey];

    } catch (error) {
        console.error('❌ Erro ao verificar anexos:', error);
        return {
            anexos: [],
            proximoNumero: '01',
            temAnexos: false
        };
    }
}

// FUNÇÃO: Gerar nome do arquivo do anexo
function gerarNomeArquivoAnexo(ano, mes, opmCodigo, composicaoCod, numeroAnexo) {
    return `${ano}${mes}${opmCodigo}${composicaoCod}${numeroAnexo}`;
}

// FUNÇÃO: Montar lista de anexos disponíveis (MODIFICADA - usa URLs)
function montarListaAnexosDisponiveis(anexosInfo) {
    if (!anexosInfo || anexosInfo.anexos.length === 0) {
        return '<div class="alert alert-info">Nenhum anexo existente para esta OPM/Composição.</div>';
    }

    let html = `
        <div class="alert alert-warning">
            <strong><i class="fas fa-info-circle me-2"></i>ATENÇÃO:</strong>
            Existem ${anexosInfo.anexos.length} anexo(s) cadastrado(s) para esta OPM e Composição.
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold">Anexos disponíveis:</label>
            <div class="list-group" style="max-height: 200px; overflow-y: auto;">
    `;

    anexosInfo.anexos.forEach((anexo) => {
        html += `
            <div class="list-group-item list-group-item-action">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Anexo ${anexo.numero}</strong>
                        <br>
                        <small class="text-muted">${anexo.nome_sistema}.pdf</small>
                        <br>
                        <small class="text-muted">Por: ${anexo.upload_por_nome}</small>
                    </div>
                    <div>
                        <button type="button" class="btn btn-sm btn-outline-primary btn-visualizar-anexo"
                                data-url="${anexo.url}"
                                title="Visualizar anexo">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold" for="selectAnexoExistente">Anexo de referência:</label>
            <select class="form-select" id="selectAnexoExistente">
                <option value="">Selecione o anexo de referência...</option>
    `;

    anexosInfo.anexos.forEach((anexo) => {
        html += `<option value="${anexo.numero}">Anexo ${anexo.numero} - ${anexo.nome_sistema}.pdf</option>`;
    });

    html += `
            </select>
            <small class="text-muted">Este anexo será gravado como referência em <strong>comprovante_anexo</strong>.</small>
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold">A justificativa já consta em algum desses anexos?</label>
            <div class="form-check">
                <input class="form-check-input" type="radio" name="usarAnexoExistente"
                       id="usarAnexoSim" value="sim" checked>
                <label class="form-check-label" for="usarAnexoSim">
                    <strong class="text-success">Sim</strong> - Usar anexo(s) existente(s)
                </label>
            </div>
            <div class="form-check">
                <input class="form-check-input" type="radio" name="usarAnexoExistente"
                       id="usarAnexoNao" value="nao">
                <label class="form-check-label" for="usarAnexoNao">
                    <strong class="text-danger">Não</strong> - Anexar novo documento
                </label>
            </div>
        </div>
    `;

    return html;
}

// NOVA FUNÇÃO: Salvar metadados do anexo no Firebase (SEM base64)
async function salvarMetadadosAnexo(ano, mes, opmCodigo, composicaoCod, numeroAnexo, urlCloudinary, nomeSistema, arquivo) {
    try {
        const caminhoAnexo = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos/${numeroAnexo}`;
        const anexoRef = ref(database, caminhoAnexo);

        const dadosAnexo = {
            url: urlCloudinary,
            nome_sistema: nomeSistema,
            upload_por_re: userRE,
            upload_por_nome: userDataCache.nome,
            upload_em: new Date().toISOString()
        };

        await set(anexoRef, dadosAnexo);
        console.log(`✅ Metadados salvos em: ${caminhoAnexo}`);

        const cacheKey = `${ano}-${mes}-${opmCodigo}-${composicaoCod}`;
        if (anexosExistentesCache[cacheKey]) {
            anexosExistentesCache[cacheKey].anexos.push({
                numero: numeroAnexo,
                url: urlCloudinary,
                nome_sistema: nomeSistema,
                upload_por_re: userRE,
                upload_por_nome: userDataCache.nome,
                upload_em: new Date().toISOString()
            });
            anexosExistentesCache[cacheKey].proximoNumero = (parseInt(numeroAnexo) + 1).toString().padStart(2, '0');
        }

        return { sucesso: true, numeroAnexo };

    } catch (error) {
        console.error('❌ Erro ao salvar metadados:', error);
        throw error;
    }
}

// FUNÇÃO: Mostrar modal para visualizar anexo (MODIFICADA - usa URL)
function mostrarModalVisualizarAnexo(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

// FUNÇÃO: Formatar tamanho do arquivo
function formatarTamanhoArquivo(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// FUNÇÃO: Validar arquivo PDF
function validarArquivoPDF(arquivo) {
    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.pdf')) return false;

    const tiposPermitidos = ['application/pdf'];
    if (arquivo.type && !tiposPermitidos.includes(arquivo.type)) {
        console.warn('Tipo MIME não reconhecido como PDF:', arquivo.type);
    }

    return true;
}

// FUNÇÃO: Ordenar por posto/grad
function ordenarPorPostoGradCorrigido(militares) {
    return militares.sort((a, b) => {
        const ordemA = HIERARQUIA_MILITAR[a.PostoGrad] || 999;
        const ordemB = HIERARQUIA_MILITAR[b.PostoGrad] || 999;

        if (ordemA !== ordemB) return ordemA - ordemB;

        const reA = parseInt(a.re) || 999999;
        const reB = parseInt(b.re) || 999999;
        return reA - reB;
    });
}

// FUNÇÃO: Buscar escalados
async function buscarEscaladosModal(idSistema, dataSolicitacao) {
    try {
        console.log('🔍 Buscando escalados para ID:', idSistema, 'Data:', dataSolicitacao);

        const idSistemaStr = String(idSistema || '').trim();
        const dataSolicitacaoStr = String(dataSolicitacao || '').trim();

        if (!idSistemaStr || idSistemaStr === '-' || idSistemaStr === 'null' || idSistemaStr === 'undefined') {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, 'ID da escala não informada');
            return;
        }

        const idNumerico = idSistemaStr.replace(/\D/g, '');

        if (!idNumerico || idNumerico.length < 3) {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, 'ID da escala inválida');
            return;
        }

        const dataExtraida = extrairDataSemFuso(dataSolicitacaoStr);

        if (!dataExtraida) {
            mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema,
                `Formato de data não reconhecido: "${dataSolicitacaoStr}"`);
            return;
        }

        const { ano, mes, dia } = dataExtraida;

        const caminhoBase = `escalados/${ano}/${mes}/${dia}`;
        const escaladosRef = ref(database, caminhoBase);
        const snapshot = await get(escaladosRef);

        const militaresEncontrados = [];

        if (snapshot.exists()) {
            const dados = snapshot.val();
            const chaves = Object.keys(dados);

            for (const chaveCompleta of chaves) {
                try {
                    if (chaveCompleta.length < 7) continue;

                    const idNaChave = chaveCompleta.slice(0, -6);

                    if (idNaChave === idNumerico) {
                        const militarData = dados[chaveCompleta];
                        const re = chaveCompleta.slice(-6);

                        militaresEncontrados.push({
                            PostoGrad: militarData.PostoGrad || 'NÃO INFORMADO',
                            re: re,
                            Militar: militarData.Militar || 'NÃO INFORMADO',
                            OPM: militarData.OPM || '',
                            Estacao: militarData.Estacao || '',
                            Composicao: militarData.Composicao || ''
                        });
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao processar chave:', error);
                }
            }
        }

        const militaresOrdenados = ordenarPorPostoGradCorrigido(militaresEncontrados);

        mostrarModalEscaladosCompleto(militaresOrdenados, dataSolicitacaoStr, idNumerico);

    } catch (error) {
        console.error('❌ Erro na busca:', error);
        mostrarModalEscaladosCompleto([], dataSolicitacao, idSistema, `Erro: ${error.message}`);
    }
}

// FUNÇÃO: Mostrar modal de escalados
function mostrarModalEscaladosCompleto(militares, dataSolicitacao, idSistema, erro = null) {
    const modalId = `modalEscalados-${Date.now()}`;

    let dataFormatada = dataSolicitacao;
    const dataExtraida = extrairDataSemFuso(dataSolicitacao);
    if (dataExtraida) {
        dataFormatada = `${dataExtraida.dia}/${dataExtraida.mes}/${dataExtraida.ano}`;
    }

    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-users me-2"></i>
                            Militares Escalados - ${dataFormatada}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <h6>Militares Escalados</h6>
                            <small class="text-muted">ID da Escala: ${idSistema} | Total de militares: ${militares.length}</small>
                        </div>

                        ${erro ? `
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Erro:</strong> ${erro}
                        </div>
                        ` : ''}

                        ${militares.length > 0 ? `
                        <div class="table-responsive mt-3">
                            <table class="table table-sm table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th width="50" class="text-center">#</th>
                                        <th>POSTO/GRAD</th>
                                        <th width="100" class="text-center">RE</th>
                                        <th>MILITAR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${militares.map((militar, index) => `
                                        <tr>
                                            <td class="text-center align-middle">${index + 1}</td>
                                            <td class="align-middle">
                                                <span class="badge bg-secondary">${militar.PostoGrad}</span>
                                            </td>
                                            <td class="text-center align-middle">
                                                <code class="fw-bold">${militar.re}</code>
                                            </td>
                                            <td class="align-middle">${militar.Militar}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <div class="mt-4 pt-3 border-top text-center">
                            <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${idSistema}"
                               target="_blank"
                               class="btn btn-primary">
                                <i class="fas fa-external-link-alt me-2"></i>
                                Abrir Escala no Sistema
                            </a>
                        </div>
                        ` : `
                        <div class="text-center py-4">
                            <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">Nenhum militar escalado encontrado</h5>
                            <p class="text-muted">
                                ID: <code>${idSistema}</code> | Data: ${dataFormatada}<br>
                                Esta escala não possui militares registrados no sistema.
                            </p>

                            <div class="mt-4">
                                <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${idSistema}"
                                   target="_blank"
                                   class="btn btn-outline-primary">
                                    <i class="fas fa-external-link-alt me-2"></i>
                                    Ver Escala no Sistema
                                </a>
                            </div>
                        </div>
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        modalElement.addEventListener('hidden.bs.modal', () => {
            setTimeout(() => {
                if (modalContainer.parentNode) {
                    modalContainer.parentNode.removeChild(modalContainer);
                }
            }, 300);
        });
    }
}

// FUNÇÃO: Atualizar campo anexo (MODIFICADA - usa URLs)
async function atualizarCampoAnexo(prioridade) {
    const divAnexo = document.getElementById('divAnexo');
    const labelAnexo = document.getElementById('labelAnexo');
    const textoAjuda = document.getElementById('textoAjudaAnexo');
    const inputAnexo = document.getElementById('inputAnexo');
    const chkDispensarAnexoAdmin = document.getElementById('chkDispensarAnexoAdmin');

    if (!divAnexo || !labelAnexo || !textoAjuda || !inputAnexo) return;

    divAnexo.style.display = 'none';

    let divAnexosExistentes = document.getElementById('divAnexosExistentes');
    if (divAnexosExistentes) {
        divAnexosExistentes.style.display = 'none';
        divAnexosExistentes.innerHTML = '';
    }

    inputAnexo.value = '';
    inputAnexo.required = false;
    inputAnexo.removeAttribute('required');
    inputAnexo.disabled = false;
    if (chkDispensarAnexoAdmin) chkDispensarAnexoAdmin.checked = false;
    usarAnexoExistente = false;
    anexoExistenteSelecionado = null;

    if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
        divAnexo.style.display = 'block';

        if (prioridade === 'minimo_operacional') {
            labelAnexo.textContent = 'EB - Escala Operacional';
            textoAjuda.textContent = 'Anexe o documento EB - Escala Operacional';
        } else {
            labelAnexo.textContent = 'SAT - Relatório de Vistorias Atrasadas';
            textoAjuda.textContent = 'Anexe o relatório SAT de vistorias atrasadas';
        }

        textoAjuda.className = 'text-muted';
        
        if (chkDispensarAnexoAdmin) {
            chkDispensarAnexoAdmin.onchange = () => {
                const dispensado = chkDispensarAnexoAdmin.checked;
                const selectAnexoExistente = document.getElementById('selectAnexoExistente');
                
                if (dispensado) {
                    inputAnexo.value = '';
                    inputAnexo.disabled = true;
                    inputAnexo.required = false;
                    inputAnexo.removeAttribute('required');
                    usarAnexoExistente = false;
                    anexoExistenteSelecionado = null;
                    
                    document.querySelectorAll('input[name="usarAnexoExistente"]').forEach(radio => {
                        radio.checked = false;
                        radio.disabled = true;
                    });
                    
                    if (selectAnexoExistente) {
                        selectAnexoExistente.value = '';
                        selectAnexoExistente.disabled = true;
                    }
                    
                    textoAjuda.innerHTML = '<span class="text-warning">Anexo dispensado pelo administrador.</span>';
                } else {
                    document.querySelectorAll('input[name="usarAnexoExistente"]').forEach(radio => {
                        radio.disabled = false;
                    });
                    
                    inputAnexo.disabled = false;
                    inputAnexo.required = true;
                    inputAnexo.setAttribute('required', 'required');
                    textoAjuda.textContent = prioridade === 'minimo_operacional'
                        ? 'Anexe o documento EB - Escala Operacional'
                        : 'Anexe o relatÃ³rio SAT de vistorias atrasadas';
                }
            };
        }

        const opmSelecionada = document.getElementById('selectOpm')?.value;
        const composicaoSelecionada = document.getElementById('selectComposicao')?.value;
        const dataSelecionada = document.getElementById('inputData')?.value;

        if (opmSelecionada && composicaoSelecionada && dataSelecionada) {
            const [diaStr, mesStr, anoStr] = dataSelecionada.split('/');
            const ano = anoStr;
            const mes = mesStr.padStart(2, '0');

            const anexosInfo = await verificarAnexosExistentes(ano, mes, opmSelecionada, composicaoSelecionada);
            
            if (anexoDispensadoPorAdmin()) {
                inputAnexo.value = '';
                inputAnexo.disabled = true;
                inputAnexo.required = false;
                inputAnexo.removeAttribute('required');
                textoAjuda.innerHTML = '<span class="text-warning">Anexo dispensado pelo administrador.</span>';
                inputAnexo.setAttribute('data-obrigatorio', 'false');
                return;
            }

            if (anexosInfo.temAnexos) {
                divAnexosExistentes = document.getElementById('divAnexosExistentes');

                if (!divAnexosExistentes) {
                    divAnexosExistentes = document.createElement('div');
                    divAnexosExistentes.id = 'divAnexosExistentes';
                    divAnexo.parentNode.insertBefore(divAnexosExistentes, divAnexo);
                }

                const listaHTML = montarListaAnexosDisponiveis(anexosInfo);
                divAnexosExistentes.innerHTML = listaHTML;
                divAnexosExistentes.style.display = 'block';

                setTimeout(() => {
                    if (anexoDispensadoPorAdmin()) return;
                    
                    document.querySelectorAll('.btn-visualizar-anexo').forEach(btn => {
                        btn.addEventListener('click', () => {
                            mostrarModalVisualizarAnexo(btn.dataset.url);
                        });
                    });

                    const selectAnexoExistente = document.getElementById('selectAnexoExistente');
                    if (selectAnexoExistente) {
                        selectAnexoExistente.addEventListener('change', (e) => {
                            anexoExistenteSelecionado = e.target.value || null;
                        });
                    }

                    document.querySelectorAll('input[name="usarAnexoExistente"]').forEach(radio => {
                        radio.addEventListener('change', (e) => {
                            usarAnexoExistente = (e.target.value === 'sim');
                            inputAnexo.required = !usarAnexoExistente;

                            if (usarAnexoExistente) {
                                inputAnexo.removeAttribute('required');
                                textoAjuda.innerHTML = `<span class="text-success">✓ Usando anexo existente</span>`;
                                inputAnexo.disabled = true;
                                if (selectAnexoExistente) {
                                    selectAnexoExistente.disabled = false;
                                }
                            } else {
                                inputAnexo.setAttribute('required', 'required');
                                textoAjuda.textContent = prioridade === 'minimo_operacional'
                                    ? 'Anexe o documento EB - Escala Operacional'
                                    : 'Anexe o relatório SAT de vistorias atrasadas';
                                inputAnexo.disabled = false;
                                if (selectAnexoExistente) {
                                    selectAnexoExistente.disabled = true;
                                    selectAnexoExistente.value = '';
                                }
                                anexoExistenteSelecionado = null;
                            }
                        });
                    });

                    const radioSim = document.getElementById('usarAnexoSim');
                    if (radioSim) {
                        radioSim.checked = true;
                        usarAnexoExistente = true;
                        inputAnexo.required = false;
                        inputAnexo.disabled = true;
                        textoAjuda.innerHTML = `<span class="text-success">✓ Usando anexo existente</span>`;
                        const primeiroAnexo = anexosInfo.anexos[0];
                        if (selectAnexoExistente && primeiroAnexo) {
                            selectAnexoExistente.disabled = false;
                            selectAnexoExistente.value = primeiroAnexo.numero;
                            anexoExistenteSelecionado = primeiroAnexo.numero;
                        }
                    }

                }, 100);
            } else {
                inputAnexo.required = true;
                inputAnexo.setAttribute('required', 'required');
                inputAnexo.disabled = false;
                usarAnexoExistente = false;
                anexoExistenteSelecionado = null;
            }
        } else {
            inputAnexo.required = true;
            inputAnexo.setAttribute('required', 'required');
            inputAnexo.disabled = false;
            usarAnexoExistente = false;
        }
    }

    inputAnexo.setAttribute('data-obrigatorio',
        (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') ? 'true' : 'false'
    );
}

// FUNÇÃO: Verificar duplicidade
async function verificarDuplicidade(dados) {
    const diasDuplicados = [];

    for (const dia of dados.diasSelecionados) {
        const [ano, mes, resto] = dados.data_base.split('-');
        const diaHoraMinuto = `${dia.toString().padStart(2, '0')}${dados.horario_inicial.replace(/:/g, '')}`;
        const caminho = `${ano}/${mes}/${dados.opm_codigo}/${dados.composicao_cod}/${diaHoraMinuto}`;

        const solicitacaoRef = ref(database, `solicitacoes/${caminho}`);
        const snapshot = await get(solicitacaoRef);

        if (snapshot.exists()) {
            diasDuplicados.push(dia);
        }
    }

    return diasDuplicados;
}

// FUNÇÃO: Cadastrar nova solicitação (MODIFICADA - upload único)
async function cadastrarSolicitacao() {
    try {
        const btnCadastrar = document.getElementById('btnCadastrar');
        if (!btnCadastrar) return;

        const originalText = btnCadastrar.innerHTML;
        btnCadastrar.disabled = true;
        btnCadastrar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Processando...';

        const prioridade = document.getElementById('selectPrioridade').value;
        const inputAnexo = document.getElementById('inputAnexo');
        const opmSelecionada = document.getElementById('selectOpm').value;
        const composicaoSelecionada = document.getElementById('selectComposicao').value;
        const dataSelecionada = document.getElementById('inputData').value;

        const [diaStr, mesStr, anoStr] = dataSelecionada.split('/');
        const ano = anoStr;
        const mes = mesStr.padStart(2, '0');

        const formData = coletarDadosFormulario();

        const validacao = validarDadosFormulario(formData);
        if (!validacao.valido) {
            mostrarMensagemFormulario(validacao.mensagem, 'danger');
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }

        const diasDuplicados = await verificarDuplicidade(formData);
        if (diasDuplicados.length > 0) {
            mostrarMensagemFormulario(
                `Os dias ${diasDuplicados.join(', ')} já possuem solicitação cadastrada.`,
                'danger'
            );
            btnCadastrar.disabled = false;
            btnCadastrar.innerHTML = originalText;
            return;
        }

        let urlAnexo = null;
        let numeroAnexo = null;
        let nomeSistema = null;

        const dispensarAnexoAdmin = anexoDispensadoPorAdmin();

        if ((prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') && !dispensarAnexoAdmin) {
            const anexosInfo = await verificarAnexosExistentes(ano, mes, opmSelecionada, composicaoSelecionada);

            const radioSim = document.querySelector('input[name="usarAnexoExistente"][value="sim"]');
            const usarAnexoExistenteAtual = radioSim ? radioSim.checked : false;

            if (anexosInfo.temAnexos && usarAnexoExistenteAtual) {
                if (!anexoExistenteSelecionado) {
                    mostrarMensagemFormulario('❌ Selecione o anexo de referência da lista de anexos existentes.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }
                numeroAnexo = anexoExistenteSelecionado;
                console.log(`Solicitação cadastrada usando anexo existente de referência: ${numeroAnexo}.`);
            } else {
                if (!inputAnexo || inputAnexo.files.length === 0) {
                    mostrarMensagemFormulario('❌ Selecione um arquivo PDF para anexar.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }

                const arquivo = inputAnexo.files[0];
                if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
                    mostrarMensagemFormulario('❌ O arquivo deve ser PDF.', 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    return;
                }

                const progressBar = document.getElementById('progressAnexo');
                const progressFill = progressBar?.querySelector('.progress-bar');
                if (progressBar) progressBar.style.display = 'block';
                if (progressFill) progressFill.style.width = '30%';

                const proximoNumero = anexosInfo.proximoNumero;
                nomeSistema = gerarNomeArquivoCloudinary(ano, mes, opmSelecionada, composicaoSelecionada, proximoNumero);

                try {
                    if (progressFill) progressFill.style.width = '60%';

                    const resultado = await uploadParaCloudinary(arquivo, nomeSistema);
                    urlAnexo = resultado.url;
                    numeroAnexo = proximoNumero;

                    if (progressFill) progressFill.style.width = '90%';

                    await salvarMetadadosAnexo(
                        ano, mes, opmSelecionada, composicaoSelecionada,
                        numeroAnexo, urlAnexo, nomeSistema, arquivo
                    );

                    if (progressFill) progressFill.style.width = '100%';
                    setTimeout(() => {
                        if (progressBar) progressBar.style.display = 'none';
                        if (progressFill) progressFill.style.width = '0%';
                    }, 500);

                } catch (uploadError) {
                    console.error('❌ Erro no upload:', uploadError);
                    mostrarMensagemFormulario(`❌ Erro no upload: ${uploadError.message}`, 'danger');
                    btnCadastrar.disabled = false;
                    btnCadastrar.innerHTML = originalText;
                    if (progressBar) progressBar.style.display = 'none';
                    return;
                }
            }
        }

        let sucessos = 0;
        let erros = [];

        for (const dia of formData.diasSelecionados) {
            try {
                await cadastrarDiaSolicitacao(formData, dia, numeroAnexo, urlAnexo, nomeSistema);
                sucessos++;
            } catch (error) {
                erros.push(`Dia ${dia}: ${error.message}`);
            }
        }

        if (sucessos > 0) {
            mostrarMensagemFormulario(
                `${sucessos} solicitação(ões) cadastrada(s) com sucesso!`,
                'success'
            );

            limparFormularioSilencioso();
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
        }

        if (erros.length > 0) {
            mostrarMensagemFormulario(
                `⚠️ ${erros.length} erro(s):<br>${erros.join('<br>')}`,
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

// FUNÇÃO: Cadastrar um dia específico
async function cadastrarDiaSolicitacao(dados, dia, numeroAnexo, urlAnexo, nomeSistema) {
    const [ano, mes, resto] = dados.data_base.split('-');
    const diaFormatado = dia.toString().padStart(2, '0');
    const horaMinuto = dados.horario_inicial.replace(/:/g, '');
    const diaHoraMinuto = `${diaFormatado}${horaMinuto}`;

    const idSolicitacao = `${ano}/${mes}/${dados.opm_codigo}/${dados.composicao_cod}/${diaHoraMinuto}`;

    let composicaoNome = '';
    if (composicoesDisponiveis[dados.opm_codigo]?.[dados.composicao_cod]) {
        composicaoNome = composicoesDisponiveis[dados.opm_codigo][dados.composicao_cod].composicao || '';
    }

    const dadosSolicitacao = {
        data: `${ano}-${mes}-${diaFormatado}`,
        opm_codigo: dados.opm_codigo,
        opm_nome: dados.opm_nome,
        composicao_cod: dados.composicao_cod,
        composicao_nome: composicaoNome,
        horario_inicial: dados.horario_inicial,
        horario_final: dados.horario_final,
        Solic_Subten_Sgt: dados.solic_subten_sgt,
        Solic_Cb_Sd: dados.solic_cb_sd,
        Solic_Superior: dados.solic_superior || 0,
        Solic_Intermed: dados.solic_intermed || 0,
        Solic_Subalterno: dados.solic_subalterno || 0,
        ID_Firebase: idSolicitacao,
        necessidade: dados.necessidade,
        motivo: dados.motivo,
        observacoes: dados.observacoes,
        comprovante_anexo: numeroAnexo,
        anexo_dispensado_admin: dados.anexo_dispensado_admin === true,
        criado_por_re: userRE,
        criado_por_nome: userDataCache.nome,
        criado_em: new Date().toISOString()
    };

    const solicitacaoRef = ref(database, `solicitacoes/${idSolicitacao}`);
    await set(solicitacaoRef, dadosSolicitacao);

    await registrarPendenciaSolicitacao(idSolicitacao, {
        ...dadosSolicitacao,
        Status_Inicial: dadosSolicitacao.Status_Inicial ?? null
    });

    const historicoRef = ref(database, `solicitacoes/${idSolicitacao}/historico`);
    const entradaHistorico = criarEntradaHistorico({
        dados_completos: 'Solicitação criada'
    });
    await update(historicoRef, entradaHistorico);

    console.log(`Solicitação cadastrada: ${idSolicitacao}`);
}

// FUNÇÃO: Criar timestamp Firebase
function criarTimestampFirebase() {
    const now = new Date();
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

// FUNÇÃO: Criar entrada de histórico
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

// FUNÇÃO: Coletar dados do formulário
function coletarDadosFormulario() {
    const dataInput = document.getElementById('inputData');
    if (!dataInput || !dataInput.value) {
        throw new Error('Data é obrigatória');
    }

    const [diaStr, mesStr, anoStr] = dataInput.value.split('/');
    const dataBase = `${anoStr}-${mesStr.padStart(2, '0')}-${diaStr.padStart(2, '0')}`;
    const diaSelecionado = parseInt(diaStr);

    const diasSelecionados = [diaSelecionado];

    const checkboxes = document.querySelectorAll('#divDiasMes input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            const dia = parseInt(cb.value);
            if (dia !== diaSelecionado) {
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
        solic_subten_sgt: parseInt(document.getElementById('inputSolicSubtenSgt').value),
        solic_cb_sd: parseInt(document.getElementById('inputSolicCbSd').value),
        solic_superior: parseInt(document.getElementById('inputSolicSuperior')?.value || '0'),
        solic_intermed: parseInt(document.getElementById('inputSolicIntermed')?.value || '0'),
        solic_subalterno: parseInt(document.getElementById('inputSolicSubalterno')?.value || '0'),
        necessidade: document.getElementById('selectPrioridade').value,
        motivo: document.getElementById('inputMotivo')?.value.trim() || '',
        observacoes: document.getElementById('inputObservacoes')?.value.trim() || '',
        anexo_dispensado_admin: anexoDispensadoPorAdmin(),
        diasSelecionados: diasSelecionados
    };
}

// FUNÇÃO: Validar dados do formulário
function anexoDispensadoPorAdmin() {
    const chkDispensar = document.getElementById('chkDispensarAnexoAdmin');
    return Boolean(userDataCache && userDataCache.nivel === 1 && chkDispensar && chkDispensar.checked);
}

function validarDadosFormulario(dados) {
    const radioSim = document.querySelector('input[name="usarAnexoExistente"][value="sim"]');
    const radioNao = document.querySelector('input[name="usarAnexoExistente"][value="nao"]');
    let usuarioEscolheuUsarAnexoExistente = false;

    if (radioSim && radioSim.checked) {
        usuarioEscolheuUsarAnexoExistente = true;
    } else if (radioNao && radioNao.checked) {
        usuarioEscolheuUsarAnexoExistente = false;
    } else {
        usuarioEscolheuUsarAnexoExistente = false;
    }

    if ((dados.necessidade === 'minimo_operacional' || dados.necessidade === 'vistoria_tecnica') && !dados.anexo_dispensado_admin) {
        if (!usuarioEscolheuUsarAnexoExistente) {
            const inputAnexo = document.getElementById('inputAnexo');
            if (!inputAnexo || inputAnexo.files.length === 0) {
                return {
                    valido: false,
                    mensagem: '❌ O anexo é obrigatório para esta necessidade. Por favor, selecione um arquivo PDF.'
                };
            }

            const arquivo = inputAnexo.files[0];
            if (!validarArquivoPDF(arquivo)) {
                return {
                    valido: false,
                    mensagem: 'O arquivo selecionado não é um PDF válido.'
                };
            }
        }
    }

    if (dados.diasSelecionados.length === 0) {
        return {
            valido: false,
            mensagem: 'Selecione pelo menos um dia para a escala.'
        };
    }

    return { valido: true, mensagem: 'Dados válidos' };
}

// FUNÇÃO: Limpar formulário silencioso
function limparFormularioSilencioso() {
    const form = document.getElementById('formNovaSolicitacao');
    if (form) form.reset();

    const inputHorarioFinal = document.getElementById('inputHorarioFinal');
    if (inputHorarioFinal) inputHorarioFinal.value = '';

    const divDiasMes = document.getElementById('divDiasMes');
    if (divDiasMes) divDiasMes.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';

    const divAnexo = document.getElementById('divAnexo');
    if (divAnexo) divAnexo.style.display = 'none';

    const divAnexosExistentes = document.getElementById('divAnexosExistentes');
    if (divAnexosExistentes) divAnexosExistentes.remove();

    usarAnexoExistente = false;
}

// FUNÇÃO: Mostrar mensagem no formulário
function mostrarMensagemFormulario(mensagem, tipo, tempoFechar = 4000) {
    const mensagensDiv = document.getElementById('mensagensForm');
    if (!mensagensDiv) return;

    const alertClass = {
        'success': 'alert-success',
        'danger': 'alert-danger',
        'warning': 'alert-warning',
        'info': 'alert-info'
    }[tipo] || 'alert-info';

    const mensagemId = 'msg-' + Date.now();

    mensagensDiv.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" id="${mensagemId}">
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    if (tempoFechar > 0) {
        setTimeout(() => {
            const mensagemElement = document.getElementById(mensagemId);
            if (mensagemElement) {
                const bsAlert = new bootstrap.Alert(mensagemElement);
                bsAlert.close();
            }
        }, tempoFechar);
    }
}

// FUNÇÃO: Formatar ID do sistema
function formatarIdSistema(idSistema) {
    try {
        if (idSistema === null || idSistema === undefined || idSistema === '' || idSistema === '-') {
            return '-';
        }

        const idStr = String(idSistema);

        if (idStr.trim() === '' || idStr === 'null' || idStr === 'undefined') {
            return '-';
        }

        const apenasNumeros = idStr.replace(/\D/g, '');

        if (apenasNumeros.length === 0) {
            return idStr;
        }

        return `
            <a href="https://sistemasadmin.intranet.policiamilitar.sp.gov.br/Escala/arrelpreesc.aspx?${apenasNumeros}"
               target="_blank"
               class="text-primary text-decoration-none"
               title="Abrir escala no sistema"
               onclick="event.stopPropagation(); return false;">
               ${idStr}
               <i class="fas fa-external-link-alt ms-1 small"></i>
            </a>
        `;
    } catch (error) {
        return idSistema || '-';
    }
}

// FUNÇÃO: Renderizar interface (LAYOUT ORIGINAL COMPLETO)
function renderInterface() {
    const content = document.getElementById('solicitacoes-content');
    if (!content) return;

    content.innerHTML = `
        <!-- Parte 1: Filtros COMPACTOS -->
        <div class="row mb-3">
            <div class="col-12">
                <div class="card">
                    <div class="card-header bg-primary text-white py-2">
                        <h6 class="mb-0"><i class="fas fa-filter me-2"></i>Filtros</h6>
                    </div>
                    <div class="card-body py-2">
                        <div class="row g-2 align-items-end">
                            <div class="col-xl-2 col-lg-3 col-md-4">
                                <label class="form-label small mb-1">OPM / Estação</label>
                                <select class="form-select form-select-sm" id="selectOpm">
                                    <option value="" ${!opmSelecionada ? 'selected' : ''}>Selecione a OPM</option>
                                    ${userDataCache.nivel === 1 ? '<option value="__OFICIAIS__" ' + (opmSelecionada === '__OFICIAIS__' ? 'selected' : '') + '>OFICIAIS</option>' : ''}
                                    ${Object.entries(opmFiltrosEspeciais)
                                        .filter(([chave]) => chave !== '__OFICIAIS__')
                                        .map(([chave]) => `
                                            <option value="${chave}" ${chave === opmSelecionada ? 'selected' : ''}>
                                                ${chave.replace('__GRUPO__', '')} - TODAS
                                            </option>
                                        `).join('')}
                                    ${opmsPermitidas.map(opm => `
                                        <option value="${opm}" ${opm === opmSelecionada ? 'selected' : ''}>
                                            ${opmsNomes[opm] || opm}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1">Mês</label>
                                <select class="form-select form-select-sm" id="selectMes">
                                    ${Array.from({length: 12}, (_, i) => {
                                        const mesNum = i + 1;
                                        const mesNome = new Date(2000, i).toLocaleDateString('pt-BR', {month: 'long'});
                                        return `<option value="${mesNum}" ${mesNum === mesFiltro ? 'selected' : ''}>
                                            ${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}
                                        </option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1">Ano</label>
                                <select class="form-select form-select-sm" id="selectAno">
                                    ${(function() {
                                        const hoje = new Date();
                                        const anoAtual = hoje.getFullYear();
                                        const mesAtual = hoje.getMonth() + 1;
                                        const mostrarProximoAno = mesAtual === 12;

                                        let anos = [anoAtual];
                                        if (mostrarProximoAno) {
                                            anos.push(anoAtual + 1);
                                        }

                                        return anos.map(ano => `
                                            <option value="${ano}" ${ano === anoFiltro ? 'selected' : ''}>
                                                ${ano}
                                            </option>
                                        `).join('');
                                    })()}
                                </select>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1 d-none d-md-block">&nbsp;</label>
                                <button type="button" class="btn btn-primary btn-sm w-100" id="btnAtualizarFiltro">
                                    <i class="fas fa-sync-alt me-1"></i>Carregar
                                </button>
                            </div>
                            <div class="col-xl-2 col-lg-2 col-md-3">
                                <label class="form-label small mb-1 d-none d-md-block">&nbsp;</label>
                                <a class="btn btn-info btn-sm w-100"
                                   id="btnTutorial"
                                   href="https://www.youtube.com/playlist?list=PL-_9SSH-2eArJx7k8AZDLrd8e8UbTAl5Q"
                                   target="_blank"
                                   rel="noopener noreferrer">
                                    <i class="fas fa-book-open me-1"></i>Tutorial
                                </a>
                            </div>
                            ${userDataCache.nivel === 1 ? `
                            <div class="col-xl-2 col-lg-3 col-md-3">
                                <label class="form-label small mb-1 d-none d-md-block">&nbsp;</label>
                                <div class="d-flex gap-2 align-items-stretch">
                                    <button class="btn btn-success btn-sm flex-grow-1" id="btnExportarCSV">
                                        <i class="fas fa-file-export me-1"></i>Exportar CSV
                                    </button>

                                    <div class="dropdown" id="notificacoes-dropdown">
                                        <button class="btn btn-warning btn-sm position-relative" data-bs-toggle="dropdown"
                                                style="min-width: 45px; padding: 5px 10px;" title="Ver solicitações pendentes">
                                            <i class="fas fa-bell"></i>
                                            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                                                id="badge-notificacoes" style="font-size: 0.55em; padding: 1px 4px;">
                                                0
                                            </span>
                                        </button>
                                        <div class="dropdown-menu dropdown-menu-end p-0" style="width: 350px;">
                                            <div class="dropdown-header bg-warning text-dark py-2">
                                                <i class="fas fa-exclamation-circle me-2"></i>Solicitações Pendentes
                                            </div>
                                            <div id="lista-notificacoes" style="max-height: 400px; overflow-y: auto;">
                                                <div class="text-center py-4">
                                                    <div class="spinner-border spinner-border-sm text-warning"></div>
                                                    <p class="small text-muted mt-2">Carregando pendências...</p>
                                                </div>
                                            </div>
                                            <div class="dropdown-divider m-0"></div>
                                            <div class="px-3 py-2">
                                                <button class="btn btn-sm btn-outline-warning w-100" id="btn-atualizar-notificacoes">
                                                    <i class="fas fa-sync-alt me-1"></i>Atualizar Lista
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="dropdown" id="liberacoes-dropdown">
                                        <button class="btn btn-danger btn-sm position-relative sirene-liberacao" data-bs-toggle="dropdown"
                                                style="min-width: 45px; padding: 5px 10px;" title="Solicitações de liberação">
                                            <i class="fas fa-bullhorn"></i>
                                            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-light text-danger"
                                                id="badge-liberacoes" style="font-size: 0.55em; padding: 1px 4px;">0</span>
                                        </button>
                                        <div class="dropdown-menu dropdown-menu-end p-0" style="width: 350px;">
                                            <div class="dropdown-header bg-danger text-white py-2">
                                                <i class="fas fa-bullhorn me-2"></i>Solicitações de liberação
                                            </div>
                                            <div id="lista-liberacoes" style="max-height: 400px; overflow-y: auto;">
                                                <div class="text-center py-4 text-muted small">Nenhuma solicitação pendente</div>
                                            </div>
                                            <div class="dropdown-divider m-0"></div>
                                            <div class="px-3 py-2">
                                                <button class="btn btn-sm btn-outline-danger w-100" id="btn-atualizar-liberacoes">
                                                    <i class="fas fa-sync-alt me-1"></i>Atualizar lista
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
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
                                           min="00:00" max="23:59"
                                           step="60">
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
                                    <label class="form-label">Necessidade <span class="text-danger">*</span></label>
                                    <select class="form-select" id="selectPrioridade" required>
                                        <option value="">Selecione...</option>
                                        <option value="minimo_operacional">Mínimo Operacional</option>
                                        <option value="viatura_extra">Viatura Extra</option>
                                        <option value="vistoria_tecnica">Vistoria Técnica</option>
                                    </select>
                                </div>
                            </div>

                            <div class="row g-3 mb-3">
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Cb/Sd <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center"
                                           id="inputSolicCbSd" min="0" max="99"
                                           required style="max-width: 80px;">
                                </div>

                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Sub/Sgt <span class="text-danger">*</span></label>
                                    <input type="number" class="form-control text-center"
                                           id="inputSolicSubtenSgt" min="0" max="99"
                                           required style="max-width: 80px;">
                                </div>

                                ${userDataCache.nivel === 1 ? `
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Ten</label>
                                    <input type="number" class="form-control text-center" id="inputSolicSubalterno" min="0" max="99" value="0" style="max-width: 80px;">
                                </div>
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Cap</label>
                                    <input type="number" class="form-control text-center" id="inputSolicIntermed" min="0" max="99" value="0" style="max-width: 80px;">
                                </div>
                                <div class="col-xl-1 col-lg-1 col-md-2 col-sm-3">
                                    <label class="form-label">Sup</label>
                                    <input type="number" class="form-control text-center" id="inputSolicSuperior" min="0" max="99" value="0" style="max-width: 80px;">
                                </div>
                                ` : ''}

                            </div>

                            <div class="row g-3 mb-3">
                                <div class="col-xl-4 col-lg-4 col-md-12">
                                    <label class="form-label">Expandir escala para:</label>
                                    <div id="divDiasMes" class="d-flex flex-wrap gap-1 p-2 border rounded bg-light">
                                        <div class="text-muted small">Selecione uma data primeiro</div>
                                    </div>
                                    <small class="text-muted">Dias retroativos ficam desabilitados (cinza)</small>
                                </div>

                                <div class="col-xl-4 col-lg-4 col-md-6">
                                    <label class="form-label">Motivo</label>
                                    <textarea class="form-control" id="inputMotivo" rows="2"
                                              placeholder="(informar o que levou a solicitação)"></textarea>
                                </div>

                                <div class="col-xl-4 col-lg-4 col-md-6">
                                    <label class="form-label">Observações</label>
                                    <textarea class="form-control" id="inputObservacoes" rows="2"
                                              placeholder="(anotações para lembretes particulares)"></textarea>
                                </div>
                            </div>

                            <div class="row g-3 mb-3">
                                <div class="col-12" id="divAnexo" style="display: none;">
                                    <div class="border rounded p-3 bg-light">
                                        <label class="form-label fw-bold mb-2" id="labelAnexo"></label>
                                        <div class="d-flex align-items-center gap-3">
                                            <input type="file" class="form-control w-auto" id="inputAnexo"
                                                accept=".pdf" title="Apenas arquivos PDF"
                                                data-obrigatorio="false">
                                            <small class="text-muted flex-grow-1" id="textoAjudaAnexo"></small>
                                        </div>
                                        ${userDataCache.nivel === 1 ? `
                                            <div class="form-check mt-2">
                                                <input class="form-check-input" type="checkbox" id="chkDispensarAnexoAdmin">
                                                <label class="form-check-label" for="chkDispensarAnexoAdmin">
                                                    Administrador: salvar sem anexar arquivo
                                                </label>
                                            </div>
                                        ` : ''}
                                        <div class="progress mt-2" style="height: 6px; display: none;" id="progressAnexo">
                                            <div class="progress-bar progress-bar-striped progress-bar-animated"
                                                 style="width: 0%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

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

                        <div id="mensagensForm" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Parte 3: Tabela de Solicitações (LAYOUT ORIGINAL) -->
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
                        <div class="p-3 pb-2" id="cardsResumoSolicitacoes">
                            <div class="row g-2">
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-subsgt text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">Sub/Sgt</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoSubSgtSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoSubSgtEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoSubSgtDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-cbsd text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">Cb/Sd</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoCbSdSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoCbSdEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoCbSdDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12 col-md-4">
                                    <div class="card card-resumo-solicitacoes card-resumo-total text-white h-100">
                                        <div class="card-body py-2 px-3">
                                            <h6 class="fw-bold mb-2">TOTAL</h6>
                                            <div class="small"><strong>Solicitado:</strong> <span id="resumoTotalSolicitado">0</span></div>
                                            <div class="small"><strong>Escalados:</strong> <span id="resumoTotalEscalados">0</span></div>
                                            <div class="small"><strong>Diferença:</strong> <span id="resumoTotalDiferenca">0</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="px-3 pb-3">
                            <div class="border rounded bg-light p-3">
                                <div class="row g-2 align-items-end">
                                    <div class="col-12 col-xl-4">
                                        <label class="form-label small fw-bold mb-1">
                                            Código de local
                                        </label>
                                        <div class="dropdown w-100" id="filtroTabelaCodigo">
                                            <button class="btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-start" type="button"
                                                    id="filtroTabelaCodigoBotao" aria-expanded="false">
                                                <span id="filtroTabelaCodigoResumo">Todos</span>
                                            </button>
                                            <div class="dropdown-menu w-100 p-2 shadow-sm" style="max-height: min(60vh, 420px); overflow-y: scroll; min-width: 100%;"
                                                 id="filtroTabelaCodigoOpcoes">
                                                <div class="text-muted small px-2 py-1">Carregando...</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-6 col-xl-2">
                                        <label class="form-label small fw-bold mb-1" for="filtroTabelaDiaInicial">
                                            Dia inicial
                                        </label>
                                        <select class="form-select form-select-sm" id="filtroTabelaDiaInicial">
                                            <option value="">Todos</option>
                                        </select>
                                    </div>
                                    <div class="col-6 col-xl-2">
                                        <label class="form-label small fw-bold mb-1" for="filtroTabelaDiaFinal">
                                            Dia final
                                        </label>
                                        <select class="form-select form-select-sm" id="filtroTabelaDiaFinal">
                                            <option value="">Todos</option>
                                        </select>
                                    </div>
                                    <div class="col-6 col-xl-1">
                                        <label class="form-label small fw-bold mb-1" for="filtroTabelaStatusBotao">
                                            Status
                                        </label>
                                        <div class="dropdown" id="filtroTabelaStatus">
                                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-truncate"
                                                    id="filtroTabelaStatusBotao" data-bs-toggle="dropdown" aria-expanded="false">
                                                <span id="filtroTabelaStatusResumo">Todos</span>
                                            </button>
                                            <div class="dropdown-menu p-2" id="filtroTabelaStatusOpcoes" aria-labelledby="filtroTabelaStatusBotao"></div>
                                        </div>
                                    </div>
                                    <div class="col-12 col-xl-1 d-grid">
                                        <button type="button" class="btn btn-sm btn-outline-secondary" id="btnResetarFiltrosTabela">
                                            Resetar
                                        </button>
                                    </div>
                                    <div class="col-12 col-xl-2 d-grid">
                                        <button type="button" class="btn btn-sm btn-primary" id="btnAtualizarTabela">
                                            <i class="fas fa-sync me-1"></i>Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="table-responsive" style="max-height: 620px; overflow-y: auto;">
                            <table class="table table-hover table-sm mb-0" id="tabelaSolicitacoes">
                                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                                    <tr class="text-center">
                                        <th width="90">AÇÕES</th>
                                        <th width="90">DATA</th>
                                        <th>COMPOSIÇÃO</th>
                                        <th width="70">COD</th>
                                        <th width="120">HORÁRIO</th>
                                        <th colspan="${userDataCache.nivel === 1 ? 5 : 2}" class="text-center">VAGAS SOLICITADAS</th>
                                        <th width="80" class="text-center">PRIOR.</th>
                                        <th width="80" class="text-center">STATUS</th>
                                        <th width="80">ID</th>
                                        <th width="140">PRAZO</th>
                                        <th colspan="${userDataCache.nivel === 1 ? 5 : 2}" class="text-center">ESCALADO</th>
                                        <th width="60"></th>
                                    </tr>
                                    <tr class="text-center small table-secondary">
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        ${userDataCache.nivel === 1
                                            ? '<th class="col-posto">CBSD</th><th class="col-posto">SGT</th><th class="col-posto">Ten</th><th class="col-posto">Cap</th><th class="col-posto">Sup</th>'
                                            : '<th class="col-posto">CBSD</th><th class="col-posto">SGT</th>'}
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        ${userDataCache.nivel === 1
                                            ? '<th class="col-posto">CBSD</th><th class="col-posto">SGT</th><th class="col-posto">Ten</th><th class="col-posto">Cap</th><th class="col-posto">Sup</th>'
                                            : '<th class="col-posto">CBSD</th><th class="col-posto">SGT</th>'}
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="tbodySolicitacoes">
                                    <tr>
                                        <td colspan="20" class="text-center py-5">
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

    posicionarAcoesTesteNoNavbar();
    inicializarDatepicker();
    inicializarEventListeners();
    atualizarTabelaSolicitacoes();

    setTimeout(async () => {
        const prioridadeSelect = document.getElementById('selectPrioridade');
        if (prioridadeSelect && prioridadeSelect.value) {
            await atualizarCampoAnexo(prioridadeSelect.value);
        }
    }, 500);

    const inputHorarioInicial = document.getElementById('inputHorarioInicial');
    if (inputHorarioInicial) {
        inputHorarioInicial.addEventListener('change', calcularHorarioFinal);
    }

    const inputData = document.getElementById('inputData');
    if (inputData) {
        inputData.addEventListener('change', atualizarDiasMes);
    }

    configurarInputHorario();

    if (userDataCache && userDataCache.nivel === 1) {
        setTimeout(() => {
            setupNotificacoesSolicitacoes();
            setupSireneLiberacoes();
            carregarLiberacoesPendentes();
            setTimeout(() => {
                if (window.carregarNotificacoesAdmin) {
                    window.carregarNotificacoesAdmin();
                }
            }, 2000);
        }, 500);
    }
}

// FUNÇÃO: Configurar input de horário
function configurarInputHorario() {
    const input = document.getElementById('inputHorarioInicial');
    if (!input) return;

    input.step = '60';
    input.addEventListener('input', calcularHorarioFinal);
}

// FUNÇÃO: Inicializar datepicker
function inicializarDatepicker() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    try {
        flatpickr('.datepicker', {
            dateFormat: 'd/m/Y',
            locale: 'pt',
            minDate: amanha,
            disableMobile: true,
            onChange: atualizarDiasMes
        });

        const inputData = document.getElementById('inputData');
        if (inputData) {
            inputData.value = '';
        }
    } catch (error) {
        console.warn('Flatpickr não carregado:', error);
    }
}

// FUNÇÃO: Calcular horário final
function calcularHorarioFinal() {
    const inputInicial = document.getElementById('inputHorarioInicial');
    const inputFinal = document.getElementById('inputHorarioFinal');

    if (!inputInicial || !inputInicial.value) {
        if (inputFinal) inputFinal.value = '';
        return;
    }

    const [horas, minutos] = inputInicial.value.split(':').map(Number);
    let horasFinais = horas + 8;

    if (horasFinais >= 24) horasFinais -= 24;

    if (inputFinal) {
        inputFinal.value = `${horasFinais.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
    }

}

// FUNÇÃO: Atualizar dias do mês
function atualizarDiasMes() {
    const divDias = document.getElementById('divDiasMes');
    if (!divDias) return;

    const inputData = document.getElementById('inputData');
    if (!inputData || !inputData.value) {
        divDias.classList.remove('dias-calendario');
        divDias.innerHTML = '<div class="text-muted small">Selecione uma data primeiro</div>';
        return;
    }

    const [diaSelecionadoStr, mesStr, anoStr] = inputData.value.split('/');
    const diaSelecionado = parseInt(diaSelecionadoStr, 10);
    const mes = parseInt(mesStr, 10);
    const ano = parseInt(anoStr, 10);

    if (!diaSelecionado || !mes || !ano) {
        divDias.classList.remove('dias-calendario');
        divDias.innerHTML = '<div class="text-muted small">Data inválida</div>';
        return;
    }

    const ultimoDia = new Date(ano, mes, 0).getDate();
    const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
    const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const classeProntidaoDia = (dia) => {
        const dataAtual = Date.UTC(ano, mes - 1, dia);
        const dataBase = Date.UTC(2026, 0, 1);
        const diferencaDias = Math.round((dataAtual - dataBase) / 86400000);
        const cores = ['dia-prontidao-verde', 'dia-prontidao-amarela', 'dia-prontidao-azul'];
        return cores[((diferencaDias % 3) + 3) % 3];
    };

    let html = diasSemana
        .map((dia) => `<div class="dias-calendario-semana">${dia}</div>`)
        .join('');

    for (let i = 0; i < primeiroDiaSemana; i++) {
        html += '<div class="dia-calendario-vazio" aria-hidden="true"></div>';
    }

    for (let dia = 1; dia <= ultimoDia; dia++) {
        const isDiaRetroativo = dia < diaSelecionado;
        const checked = dia === diaSelecionado;
        const disabled = isDiaRetroativo || checked;
        const classes = [
            'dia-calendario-celula',
            classeProntidaoDia(dia),
            isDiaRetroativo ? 'dia-calendario-retroativo' : '',
            checked ? 'dia-calendario-selecionado' : ''
        ].filter(Boolean).join(' ');

        html += `
            <div class="dia-calendario-item">
                <input class="dia-calendario-input visually-hidden" type="checkbox"
                       id="dia${dia}" value="${dia}"
                       ${disabled ? 'disabled' : ''}
                       ${checked ? 'checked' : ''}>
                <label class="${classes}" for="dia${dia}">
                    ${dia.toString().padStart(2, '0')}
                </label>
            </div>
        `;
    }

    html += `<div class="dias-calendario-info"><i class="fas fa-info-circle me-1"></i> O dia ${diaSelecionado} está automaticamente incluído</div>`;

    divDias.classList.add('dias-calendario');
    divDias.innerHTML = html || '<small class="text-muted">Nenhum dia disponível neste mês</small>';
}
// FUNÇÃO: Sincronizar filtro de mês com a data selecionada
async function sincronizarMesFiltroComDataSelecionada() {
    const inputData = document.getElementById('inputData');
    const selectMes = document.getElementById('selectMes');

    if (!inputData?.value || !selectMes?.value) return;

    const partesData = inputData.value.split('/');
    if (partesData.length !== 3) return;

    const mesData = parseInt(partesData[1], 10);
    const mesSelecionado = parseInt(selectMes.value, 10);

    if (isNaN(mesData) || mesData < 1 || mesData > 12 || mesData === mesSelecionado) return;

    const nomeMesSelecionado = selectMes.options[selectMes.selectedIndex]?.text?.trim() || `Mês ${mesSelecionado}`;
    const opcaoNovoMes = selectMes.querySelector(`option[value="${mesData}"]`);
    const nomeNovoMes = opcaoNovoMes?.text?.trim() || `Mês ${mesData}`;

    alert(`A data informada está em ${nomeNovoMes}, mas o filtro está em ${nomeMesSelecionado}. A tabela de solicitações será atualizada para o mês de ${nomeNovoMes}.`);

    selectMes.value = String(mesData);
    mesFiltro = mesData;
    anexosExistentesCache = {};
    usarAnexoExistente = false;

    await atualizarTabelaComDelay();
}

// FUNÇÃO: Inicializar event listeners
function filtrosObrigatoriosPreenchidos() {
    return Boolean(
        document.getElementById('selectOpm')?.value &&
        document.getElementById('selectMes')?.value &&
        document.getElementById('selectAno')?.value
    );
}

function setFormularioSolicitacaoBloqueado(bloqueado) {
    const form = document.getElementById('formNovaSolicitacao');
    if (!form) return;

    form.classList.toggle('formulario-bloqueado', bloqueado);
    form.querySelectorAll('input, select, textarea, button').forEach((campo) => {
        campo.disabled = bloqueado;
    });

    const mensagens = document.getElementById('mensagensForm');
    if (mensagens && bloqueado) {
        mensagens.innerHTML = '<div class="alert alert-secondary py-2 mb-0"><i class="fas fa-lock me-1"></i> Preencha os filtros para carregar a tabela e liberar a nova solicitação.</div>';
    } else if (mensagens && mensagens.textContent.includes('Preencha os filtros')) {
        mensagens.innerHTML = '';
    }
}

function bloquearFormularioAoAlterarFiltros() {
    filtrosCarregados = false;
    setFormularioSolicitacaoBloqueado(true);
}

function limparDadosAoAlterarFiltros() {
    solicitacoesCache = [];
    filtrosTabelaSolicitacoes = {
        composicaoCodigos: [],
        diaInicial: '',
        diaFinal: '',
        status: []
    };
    anexosExistentesCache = {};
    usarAnexoExistente = false;
    anexoExistenteSelecionado = null;
    limparFormularioSilencioso();
    atualizarTabelaSolicitacoes();
}

function atualizarBloqueioFormularioPorTabela() {
    const tbody = document.getElementById('tbodySolicitacoes');
    const tabelaCarregada = Boolean(tbody && !tbody.querySelector('.fa-spinner'));
    const selecaoOpm = document.getElementById('selectOpm')?.value || '';
    const opmVirtual = Boolean(opmFiltrosEspeciais[selecaoOpm]);

    setFormularioSolicitacaoBloqueado(!(filtrosObrigatoriosPreenchidos() && filtrosCarregados && tabelaCarregada && !opmVirtual));
}

function campoObrigatorioVisivel(campo) {
    if (campo.disabled || !campo.required) return false;

    const anexo = campo.closest('#divAnexo');
    return !(anexo && anexo.style.display === 'none');
}

function atualizarEstadoCampoObrigatorio(campo) {
    if (!campoObrigatorioVisivel(campo)) {
        campo.classList.remove('is-invalid');
        campo.removeAttribute('aria-invalid');
        return true;
    }

    const valido = campo.checkValidity();
    campo.classList.toggle('is-invalid', !valido);
    campo.toggleAttribute('aria-invalid', !valido);
    return valido;
}

function validarCamposObrigatoriosFormulario() {
    const form = document.getElementById('formNovaSolicitacao');
    if (!form) return true;

    const campos = [...form.querySelectorAll('input, select, textarea')]
        .filter(campoObrigatorioVisivel);
    const todosValidos = campos.map(atualizarEstadoCampoObrigatorio).every(Boolean);

    if (!todosValidos) {
        const primeiroInvalido = campos.find((campo) => !campo.checkValidity());
        primeiroInvalido?.focus();
    }

    return todosValidos;
}

function configurarValidacaoVisualFormulario() {
    const form = document.getElementById('formNovaSolicitacao');
    if (!form || form.dataset.validacaoConfigurada) return;

    form.dataset.validacaoConfigurada = '1';
    form.addEventListener('invalid', (event) => {
        const campo = event.target;
        if (campoObrigatorioVisivel(campo)) {
            campo.classList.add('is-invalid');
            campo.setAttribute('aria-invalid', 'true');
        }
    }, true);

    form.addEventListener('input', (event) => atualizarEstadoCampoObrigatorio(event.target));
    form.addEventListener('change', (event) => atualizarEstadoCampoObrigatorio(event.target));
}

function inicializarEventListeners() {
    setFormularioSolicitacaoBloqueado(true);
    configurarValidacaoVisualFormulario();

    const selectOpm = document.getElementById('selectOpm');
    if (selectOpm) {
        selectOpm.addEventListener('change', async (e) => {
            const valorSelecionado = e.target.value;
            bloquearFormularioAoAlterarFiltros();

            if (!valorSelecionado) {
                alert('Por favor, selecione uma OPM para continuar');
                return;
            }

            opmSelecionada = valorSelecionado;
            limparDadosAoAlterarFiltros();
            atualizarComposicoesDropdown();
            mostrarMensagemFormulario('Filtros alterados. Clique em "Carregar" para consultar as solicitações.', 'info');
        });
    }

    const selectMes = document.getElementById('selectMes');
    if (selectMes) {
        selectMes.addEventListener('change', async (e) => {
            bloquearFormularioAoAlterarFiltros();
            mesFiltro = parseInt(e.target.value);
            limparDadosAoAlterarFiltros();
            mostrarMensagemFormulario('Filtros alterados. Clique em "Carregar" para consultar as solicitações.', 'info');
        });
    }

    const selectAno = document.getElementById('selectAno');
    if (selectAno) {
        selectAno.addEventListener('change', async (e) => {
            bloquearFormularioAoAlterarFiltros();
            anoFiltro = parseInt(e.target.value);
            limparDadosAoAlterarFiltros();
            mostrarMensagemFormulario('Filtros alterados. Clique em "Carregar" para consultar as solicitações.', 'info');
        });
    }

    const btnAtualizarFiltro = document.getElementById('btnAtualizarFiltro');
    if (btnAtualizarFiltro) {
        btnAtualizarFiltro.addEventListener('click', async () => {
            if (!filtrosObrigatoriosPreenchidos()) {
                setFormularioSolicitacaoBloqueado(true);
                alert('Preencha OPM, mês e ano antes de liberar a nova solicitação.');
                return;
            }

            mostrarOverlayAtualizandoTabela();
            try {
                await carregarSolicitacoesMes();
                filtrosCarregados = true;
                atualizarTabelaSolicitacoes();
                atualizarComposicoesDropdown();
            } finally {
                ocultarOverlayAtualizandoTabela();
            }
        });
    }

    const btnAtualizarTabela = document.getElementById('btnAtualizarTabela');
    if (btnAtualizarTabela) {
        btnAtualizarTabela.addEventListener('click', async () => {
            await atualizarTabelaComDelay();
        });
    }

    const formNovaSolicitacao = document.getElementById('formNovaSolicitacao');
    if (formNovaSolicitacao) {
        formNovaSolicitacao.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validarCamposObrigatoriosFormulario()) {
                mostrarMensagemFormulario('Preencha todos os campos obrigatórios destacados em vermelho.', 'danger');
                return;
            }
            await cadastrarSolicitacao();
        });
    }

    const selectComposicao = document.getElementById('selectComposicao');
    if (selectComposicao) {
        selectComposicao.addEventListener('change', async () => {
            const prioridade = document.getElementById('selectPrioridade')?.value;
            if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
                await atualizarCampoAnexo(prioridade);
            }
        });
    }

    inicializarFiltrosTabelaSolicitacoes();

    const inputData = document.getElementById('inputData');
    if (inputData) {
        inputData.addEventListener('change', async () => {
            await sincronizarMesFiltroComDataSelecionada();

            const prioridade = document.getElementById('selectPrioridade')?.value;
            if (prioridade === 'minimo_operacional' || prioridade === 'vistoria_tecnica') {
                await atualizarCampoAnexo(prioridade);
            }
        });
    }

    const selectPrioridade = document.getElementById('selectPrioridade');
    if (selectPrioridade) {
        selectPrioridade.addEventListener('change', async (e) => {
            await atualizarCampoAnexo(e.target.value);
            calcularHorarioFinal();
        });
    }

    const btnLimparForm = document.getElementById('btnLimparForm');
    if (btnLimparForm) {
        btnLimparForm.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todos os dados do formulário?')) {
                limparFormularioSilencioso();
            }
        });
    }

    if (userDataCache.nivel === 1) {
        const btnExportarCSV = document.getElementById('btnExportarCSV');
        if (btnExportarCSV) {
            btnExportarCSV.addEventListener('click', exportarCSV);
        }
    }

    const inputAnexo = document.getElementById('inputAnexo');
    if (inputAnexo) {
        inputAnexo.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                const arquivo = this.files[0];
                if (!validarArquivoPDF(arquivo)) {
                    mostrarMensagemFormulario('Apenas arquivos PDF são permitidos', 'danger');
                    this.value = '';
                }
            }
        });
    }

    if (userDataCache && userDataCache.nivel === 1) {
        setTimeout(() => {
            setupNotificacoesSolicitacoes();
            setupSireneLiberacoes();
            carregarLiberacoesPendentes();
            setTimeout(() => {
                if (window.carregarNotificacoesAdmin) {
                    window.carregarNotificacoesAdmin();
                }
            }, 2000);
        }, 500);
    }
}

function exibirAtualizandoTabela() {
    const tbody = document.getElementById('tbodySolicitacoes');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="20" class="text-center py-4 text-primary">
                <i class="fas fa-spinner fa-spin me-2"></i>Atualizando
            </td>
        </tr>
    `;
}

function mostrarOverlayAtualizandoTabela() {
    let overlay = document.getElementById('overlayAtualizandoTabela');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlayAtualizandoTabela';
        overlay.className = 'overlay-atualizando-tabela';
        overlay.innerHTML = `
            <div class="overlay-atualizando-tabela__conteudo">
                <i class="fas fa-spinner fa-spin me-2"></i>
                Carregando...
            </div>
        `;
        document.body.appendChild(overlay);
    }

    overlay.classList.add('show');
}

function ocultarOverlayAtualizandoTabela() {
    const overlay = document.getElementById('overlayAtualizandoTabela');
    if (overlay) overlay.classList.remove('show');
}

async function atualizarTabelaComDelay() {
    const selectOpm = document.getElementById('selectOpm');
    const selectMes = document.getElementById('selectMes');
    const selectAno = document.getElementById('selectAno');

    if (!selectOpm?.value || !selectMes?.value || !selectAno?.value) {
        setFormularioSolicitacaoBloqueado(true);
        return;
    }

    exibirAtualizandoTabela();
    mostrarOverlayAtualizandoTabela();

    try {
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        atualizarComposicoesDropdown();
    } finally {
        ocultarOverlayAtualizandoTabela();
    }
}

async function registrarPendenciaSolicitacao(idFirebase, dados = {}) {
    try {
        if (!idFirebase) return;

        const pendenteRef = ref(database, `SolicPendentes/${idFirebase}`);
        const agora = new Date().toISOString();

        await set(pendenteRef, {
            ID_Firebase: idFirebase,
            atualizado_em: agora
        });
    } catch (pendenteError) {
        console.warn('⚠️ Erro ao registrar pendência:', pendenteError);
    }
}

async function removerPendenciaSolicitacao(idFirebase) {
    try {
        if (!idFirebase) return;

        const pendenteRef = ref(database, `SolicPendentes/${idFirebase}`);
        await remove(pendenteRef);
    } catch (pendenteError) {
        console.warn('⚠️ Erro ao remover pendência:', pendenteError);
    }
}

// FUNÇÃO: Atualizar dropdown de composições
function atualizarComposicoesDropdown() {
    const select = document.getElementById('selectComposicao');
    if (!select || !opmSelecionada) return;

    while (select.options.length > 1) {
        select.remove(1);
    }

    if (composicoesDisponiveis[opmSelecionada]) {
        Object.entries(composicoesDisponiveis[opmSelecionada]).forEach(([cod, dados]) => {
            const option = document.createElement('option');
            option.value = cod;
            option.textContent = `${dados.composicao} (${cod})`;
            select.appendChild(option);
        });
    }
}

// FUNÇÃO: Atualizar tabela de solicitações (LAYOUT ORIGINAL COMPLETO)
function inicializarFiltrosTabelaSolicitacoes() {
    const filtroCodigo = document.getElementById('filtroTabelaCodigo');
    const botaoCodigo = document.getElementById('filtroTabelaCodigoBotao');
    const opcoesCodigo = document.getElementById('filtroTabelaCodigoOpcoes');
    const selectDiaInicial = document.getElementById('filtroTabelaDiaInicial');
    const selectDiaFinal = document.getElementById('filtroTabelaDiaFinal');
    const statusBotao = document.getElementById('filtroTabelaStatusBotao');
    const statusOpcoes = document.getElementById('filtroTabelaStatusOpcoes');
    const btnResetar = document.getElementById('btnResetarFiltrosTabela');

    if (filtroCodigo) {
        filtroCodigo.addEventListener('change', (event) => {
            if (!event.target.classList.contains('filtro-tabela-codigo-check')) return;
            filtrosTabelaSolicitacoes.composicaoCodigos = [...filtroCodigo.querySelectorAll('.filtro-tabela-codigo-check:checked')]
                .map((checkbox) => checkbox.value);
            atualizarVisibilidadeLimpezaFiltrosTabela();
            atualizarTabelaSolicitacoes();
        });

        filtroCodigo.addEventListener('click', (event) => {
            const limpar = event.target.closest('#btnLimparFiltroTabelaCodigo');
            if (!limpar) return;
            event.preventDefault();
            filtrosTabelaSolicitacoes.composicaoCodigos = [];
            filtroCodigo.querySelectorAll('.filtro-tabela-codigo-check').forEach((checkbox) => {
                checkbox.checked = false;
            });
            atualizarVisibilidadeLimpezaFiltrosTabela();
            atualizarTabelaSolicitacoes();
        });
    }

    if (filtroCodigo && botaoCodigo && opcoesCodigo) {
        const fecharDropdownCodigo = () => {
            opcoesCodigo.classList.remove('show');
            botaoCodigo.setAttribute('aria-expanded', 'false');
            ['position', 'display', 'left', 'top', 'bottom', 'width', 'max-height', 'overflow-y', 'transform', 'z-index']
                .forEach((propriedade) => opcoesCodigo.style.removeProperty(propriedade));
        };

        const posicionarDropdownCodigo = () => {
            const retangulo = botaoCodigo.getBoundingClientRect();
            const margem = 8;
            const espacoAbaixo = window.innerHeight - retangulo.bottom - margem;
            const espacoAcima = retangulo.top - margem;
            const abrirAcima = espacoAbaixo < 220 && espacoAcima > espacoAbaixo;
            const alturaDisponivel = Math.max(140, Math.min(420, abrirAcima ? espacoAcima - 4 : espacoAbaixo - 4));

            opcoesCodigo.style.setProperty('position', 'fixed', 'important');
            opcoesCodigo.style.setProperty('display', 'block', 'important');
            opcoesCodigo.style.setProperty('left', `${Math.max(margem, retangulo.left)}px`, 'important');
            opcoesCodigo.style.setProperty('width', `${retangulo.width}px`, 'important');
            opcoesCodigo.style.setProperty('max-height', `${alturaDisponivel}px`, 'important');
            opcoesCodigo.style.setProperty('overflow-y', 'auto', 'important');
            opcoesCodigo.style.setProperty('transform', 'none', 'important');
            opcoesCodigo.style.setProperty('z-index', '2050', 'important');

            if (abrirAcima) {
                opcoesCodigo.style.setProperty('top', 'auto', 'important');
                opcoesCodigo.style.setProperty('bottom', `${window.innerHeight - retangulo.top + 4}px`, 'important');
            } else {
                opcoesCodigo.style.setProperty('top', `${retangulo.bottom + 4}px`, 'important');
                opcoesCodigo.style.setProperty('bottom', 'auto', 'important');
            }
        };

        botaoCodigo.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (opcoesCodigo.classList.contains('show')) {
                fecharDropdownCodigo();
                return;
            }

            opcoesCodigo.classList.add('show');
            botaoCodigo.setAttribute('aria-expanded', 'true');
            posicionarDropdownCodigo();
        });

        opcoesCodigo.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', (event) => {
            if (!filtroCodigo.contains(event.target)) fecharDropdownCodigo();
        });
        window.addEventListener('resize', () => {
            if (opcoesCodigo.classList.contains('show')) posicionarDropdownCodigo();
        });
        window.addEventListener('scroll', (event) => {
            if (event.target === opcoesCodigo || opcoesCodigo.contains(event.target)) return;
            fecharDropdownCodigo();
        }, true);
    }

    if (selectDiaInicial) {
        selectDiaInicial.addEventListener('change', () => {
            filtrosTabelaSolicitacoes.diaInicial = selectDiaInicial.value;
            atualizarTabelaSolicitacoes();
        });
    }

    if (selectDiaFinal) {
        selectDiaFinal.addEventListener('change', () => {
            filtrosTabelaSolicitacoes.diaFinal = selectDiaFinal.value;
            atualizarTabelaSolicitacoes();
        });
    }

    if (statusOpcoes) {
        statusOpcoes.addEventListener('change', (event) => {
            if (!event.target.classList.contains('filtro-tabela-status-check')) return;
            filtrosTabelaSolicitacoes.status = [...statusOpcoes.querySelectorAll('.filtro-tabela-status-check:checked')]
                .map((checkbox) => checkbox.value);
            atualizarVisibilidadeLimpezaFiltrosTabela();
            atualizarTabelaSolicitacoes();
        });

        statusOpcoes.addEventListener('click', (event) => {
            const limpar = event.target.closest('#btnLimparFiltroTabelaStatus');
            if (!limpar) return;
            event.preventDefault();
            filtrosTabelaSolicitacoes.status = [];
            statusOpcoes.querySelectorAll('.filtro-tabela-status-check').forEach((checkbox) => {
                checkbox.checked = false;
            });
            atualizarVisibilidadeLimpezaFiltrosTabela();
            atualizarTabelaSolicitacoes();
        });
    }

    if (btnResetar) {
        btnResetar.addEventListener('click', () => {
            filtrosTabelaSolicitacoes = {
                composicaoCodigos: [],
                diaInicial: '',
                diaFinal: '',
                status: []
            };
            atualizarVisibilidadeLimpezaFiltrosTabela();
            atualizarTabelaSolicitacoes();
        });
    }

}

function atualizarVisibilidadeLimpezaFiltrosTabela() {
    const limparCodigo = document.getElementById('btnLimparFiltroTabelaCodigo');
    const limparStatus = document.getElementById('btnLimparFiltroTabelaStatus');
    const codigos = filtrosTabelaSolicitacoes.composicaoCodigos || [];
    const status = Array.isArray(filtrosTabelaSolicitacoes.status)
        ? filtrosTabelaSolicitacoes.status
        : (filtrosTabelaSolicitacoes.status ? [filtrosTabelaSolicitacoes.status] : []);

    if (limparCodigo) limparCodigo.classList.toggle('d-none', codigos.length === 0);
    if (limparStatus) limparStatus.classList.toggle('d-none', status.length === 0);
}

function obterDataSolicitacaoTabela(solicitacao) {
    let dataObj = null;

    if (solicitacao.data_local) {
        dataObj = solicitacao.data_local;
    } else if (solicitacao.data_extraida) {
        dataObj = new Date(solicitacao.data_extraida);
        dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
    } else if (solicitacao.data) {
        dataObj = new Date(solicitacao.data);
        dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
    }

    return dataObj && !isNaN(dataObj.getTime()) ? dataObj : null;
}

function valorStatusFiltroSolicitacao(solicitacao) {
    const status = solicitacao.Status_Inicial ?? solicitacao.status ?? '';
    return status === null || status === undefined || status === '' ? 'sem_status' : String(status);
}

function rotuloStatusFiltro(valor) {
    switch (String(valor)) {
        case 'pedido_liberacao': return 'Solicitação de liberação';
        case 'sem_status': return 'Aguardando';
        case '1': return 'Aprovada';
        case '2': return 'Exportada';
        case '3': return 'Cancelada';
        case '4': return 'Em edição';
        case '5': return 'Excluída';
        case '6': return 'Aguardando comprovante';
        case '7': return 'Novidade';
        default: return `Status ${valor}`;
    }
}

function atualizarOpcoesFiltrosTabelaSolicitacoes(solicitacoesValidas) {
    const filtroCodigo = document.getElementById('filtroTabelaCodigo');
    const opcoesCodigo = document.getElementById('filtroTabelaCodigoOpcoes');
    const resumoCodigo = document.getElementById('filtroTabelaCodigoResumo');
    const selectDiaInicial = document.getElementById('filtroTabelaDiaInicial');
    const selectDiaFinal = document.getElementById('filtroTabelaDiaFinal');
    const statusOpcoes = document.getElementById('filtroTabelaStatusOpcoes');
    const resumoStatus = document.getElementById('filtroTabelaStatusResumo');

    if (!filtroCodigo || !opcoesCodigo || !resumoCodigo || !selectDiaInicial || !selectDiaFinal || !statusOpcoes || !resumoStatus) return;

    const composicoes = new Map();
    const dias = new Set();
    const statusDisponiveis = new Set();

    solicitacoesValidas.forEach((solicitacao) => {
        const cod = String(solicitacao.composicao_cod || '').trim();
        if (cod) {
            composicoes.set(cod, solicitacao.composicao_nome || cod);
        }

        const dataObj = obterDataSolicitacaoTabela(solicitacao);
        if (dataObj) {
            dias.add(String(dataObj.getDate()).padStart(2, '0'));
        }

        statusDisponiveis.add(valorStatusFiltroSolicitacao(solicitacao));
        if (Number(userDataCache?.nivel) === 1 && solicitacao.pedido_liberacao_edicao) {
            statusDisponiveis.add('pedido_liberacao');
        }
    });

    obterOpmsDaSelecao().forEach((opmCodigo) => {
        Object.entries(composicoesDisponiveis[opmCodigo] || {}).forEach(([cod, dados]) => {
            const codigo = String(cod || '').trim();
            if (!codigo || composicoes.has(codigo)) return;
            composicoes.set(codigo, dados?.composicao || codigo);
        });
    });

    const composicoesOrdenadas = [...composicoes.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
    const diasOrdenados = [...dias].sort((a, b) => Number(a) - Number(b));
    const statusOrdenados = [...statusDisponiveis].sort((a, b) => {
        if (a === 'sem_status') return -1;
        if (b === 'sem_status') return 1;
        if (a === 'pedido_liberacao') return -1;
        if (b === 'pedido_liberacao') return 1;
        return Number(a) - Number(b);
    });

    filtrosTabelaSolicitacoes.composicaoCodigos = filtrosTabelaSolicitacoes.composicaoCodigos
        .filter((cod) => composicoes.has(cod));

    if (filtrosTabelaSolicitacoes.diaInicial && !dias.has(filtrosTabelaSolicitacoes.diaInicial)) {
        filtrosTabelaSolicitacoes.diaInicial = '';
    }

    if (filtrosTabelaSolicitacoes.diaFinal && !dias.has(filtrosTabelaSolicitacoes.diaFinal)) {
        filtrosTabelaSolicitacoes.diaFinal = '';
    }

    const statusSelecionados = Array.isArray(filtrosTabelaSolicitacoes.status)
        ? filtrosTabelaSolicitacoes.status
        : (filtrosTabelaSolicitacoes.status ? [filtrosTabelaSolicitacoes.status] : []);
    filtrosTabelaSolicitacoes.status = statusSelecionados.filter((status) => statusDisponiveis.has(status));

    if (composicoesOrdenadas.length === 0) {
        opcoesCodigo.innerHTML = '<div class="text-muted small px-2 py-1">Nenhum código disponível</div>';
    } else {
        opcoesCodigo.innerHTML = `
            <div class="d-flex justify-content-between align-items-center px-2 pb-2 border-bottom mb-2">
                <span class="small fw-bold">Selecionar códigos</span>
                <button type="button" class="btn btn-link btn-sm p-0" id="btnLimparFiltroTabelaCodigo">
                    Limpar
                </button>
            </div>
            ${composicoesOrdenadas.map(([cod, nome]) => `
                <div class="dropdown-item-text px-2 py-1">
                    <div class="form-check d-flex align-items-start gap-2 m-0 ps-0">
                    <input class="form-check-input filtro-tabela-codigo-check" type="checkbox"
                           style="margin-left: 0; flex: 0 0 auto;"
                           id="filtroTabelaCodigo_${cod}" value="${cod}"
                           ${filtrosTabelaSolicitacoes.composicaoCodigos.includes(cod) ? 'checked' : ''}>
                    <label class="form-check-label small w-100" style="line-height: 1.25;" for="filtroTabelaCodigo_${cod}">
                        ${cod} - ${nome}
                    </label>
                    </div>
                </div>
            `).join('')}
        `;
    }

    const opcoesDias = '<option value="">Todos</option>' +
        diasOrdenados.map((dia) => `<option value="${dia}">${dia}</option>`).join('');
    selectDiaInicial.innerHTML = opcoesDias;
    selectDiaFinal.innerHTML = opcoesDias;

    statusOpcoes.innerHTML = `
        <div class="d-flex justify-content-between align-items-center px-2 pb-2 border-bottom mb-2">
            <span class="small fw-bold">Selecionar status</span>
            <button type="button" class="btn btn-link btn-sm p-0 ${statusSelecionados.length ? '' : 'd-none'}" id="btnLimparFiltroTabelaStatus">
                Limpar
            </button>
        </div>
        ${statusOrdenados.map((status) => `
            <label class="dropdown-item-text d-flex align-items-center gap-2 px-2 py-1 mb-0">
                <input class="form-check-input filtro-tabela-status-check m-0" type="checkbox"
                       value="${status}" ${statusSelecionados.includes(status) ? 'checked' : ''}>
                <span class="small">${rotuloStatusFiltro(status)}</span>
            </label>
        `).join('')}
    `;

    if (filtrosTabelaSolicitacoes.composicaoCodigos.length === 0) {
        resumoCodigo.textContent = 'Todos';
    } else if (filtrosTabelaSolicitacoes.composicaoCodigos.length === 1) {
        const cod = filtrosTabelaSolicitacoes.composicaoCodigos[0];
        resumoCodigo.textContent = `${cod} - ${composicoes.get(cod) || ''}`.trim();
    } else {
        resumoCodigo.textContent = `${filtrosTabelaSolicitacoes.composicaoCodigos.length} códigos selecionados`;
    }

    selectDiaInicial.value = filtrosTabelaSolicitacoes.diaInicial;
    selectDiaFinal.value = filtrosTabelaSolicitacoes.diaFinal;
    if (statusSelecionados.length === 0) {
        resumoStatus.textContent = 'Todos';
    } else if (statusSelecionados.length === 1) {
        resumoStatus.textContent = rotuloStatusFiltro(statusSelecionados[0]);
    } else {
        resumoStatus.textContent = `${statusSelecionados.length} status selecionados`;
    }

    atualizarVisibilidadeLimpezaFiltrosTabela();
}

function aplicarFiltrosTabelaSolicitacoes(solicitacoesValidas) {
    let diaInicial = filtrosTabelaSolicitacoes.diaInicial ? Number(filtrosTabelaSolicitacoes.diaInicial) : null;
    let diaFinal = filtrosTabelaSolicitacoes.diaFinal ? Number(filtrosTabelaSolicitacoes.diaFinal) : null;

    if (diaInicial !== null && diaFinal !== null && diaInicial > diaFinal) {
        const temp = diaInicial;
        diaInicial = diaFinal;
        diaFinal = temp;
    }

    return solicitacoesValidas.filter((solicitacao) => {
        if (filtrosTabelaSolicitacoes.composicaoCodigos.length > 0 &&
            !filtrosTabelaSolicitacoes.composicaoCodigos.includes(String(solicitacao.composicao_cod || ''))) {
            return false;
        }

        const statusSelecionados = Array.isArray(filtrosTabelaSolicitacoes.status)
            ? filtrosTabelaSolicitacoes.status
            : (filtrosTabelaSolicitacoes.status ? [filtrosTabelaSolicitacoes.status] : []);
        const filtrarPedidosLiberacao = statusSelecionados.includes('pedido_liberacao');
        const statusReais = statusSelecionados.filter((status) => status !== 'pedido_liberacao');

        if (filtrarPedidosLiberacao && !solicitacao.pedido_liberacao_edicao) {
            return false;
        }

        if (statusReais.length > 0 &&
            !statusReais.includes(valorStatusFiltroSolicitacao(solicitacao))) {
            return false;
        }

        if (diaInicial !== null || diaFinal !== null) {
            const dataObj = obterDataSolicitacaoTabela(solicitacao);
            if (!dataObj) return false;

            const dia = dataObj.getDate();
            if (diaInicial !== null && dia < diaInicial) return false;
            if (diaFinal !== null && dia > diaFinal) return false;
        }

        return true;
    });
}

async function atualizarTabelaSolicitacoes() {
    const tbody = document.getElementById('tbodySolicitacoes');
    const contador = document.getElementById('contadorSolicitacoes');

    if (!tbody || !contador) return;

    try {
        const solicitacoesValidas = solicitacoesCache.filter(s =>
            s && s.data && !s.id.includes('/anexos') &&
            s.id_simplificado && /^\d{6}$/.test(s.id_simplificado)
        );
        atualizarOpcoesFiltrosTabelaSolicitacoes(solicitacoesValidas);
        const solicitacoesFiltradas = aplicarFiltrosTabelaSolicitacoes(solicitacoesValidas);

        contador.textContent = solicitacoesFiltradas.length;
        atualizarCardsResumoSolicitacoes(solicitacoesFiltradas);

        if (solicitacoesFiltradas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="20" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox fa-2x mb-3"></i><br>
                        Nenhuma solicitação encontrada para os filtros selecionados
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        solicitacoesFiltradas.forEach((solicitacao) => {
            const isAdmin = userDataCache.nivel === 1;
            let dataFormatada;
            let dataObj;

            if (solicitacao.data_local) {
                dataObj = solicitacao.data_local;
            } else if (solicitacao.data_extraida) {
                dataObj = new Date(solicitacao.data_extraida);
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            } else {
                dataObj = new Date(solicitacao.data);
                dataObj = new Date(dataObj.getTime() - (dataObj.getTimezoneOffset() * 60000));
            }

            if (isNaN(dataObj.getTime())) {
                dataFormatada = 'Data inválida';
            } else {
                const dia = dataObj.getDate().toString().padStart(2, '0');
                const mes = (dataObj.getMonth() + 1).toString().padStart(2, '0');
                const ano = dataObj.getFullYear();
                dataFormatada = `${dia}/${mes}/${ano}`;
            }

            const statusIcon = getIconeStatus(solicitacao.Status_Inicial);
            const statusClass = getClasseStatus(solicitacao.Status_Inicial);
            const statusTooltip = getTooltipStatus(solicitacao.Status_Inicial);

            const necessidade = solicitacao.necessidade ?? '';
            const prioridadeIcon = getIconePrioridadeCompleto(necessidade);

            const acoesHTML = gerarAcoesHTMLMelhorado(solicitacao);

            const vagasSubten = solicitacao.solic_subten_sgt || 0;
            const vagasCbSd = solicitacao.solic_cb_sd || 0;
            const solicSuperior = solicitacao.solic_superior || 0;
            const solicIntermed = solicitacao.solic_intermed || 0;
            const solicSubalterno = solicitacao.solic_subalterno || 0;

            const atzSubten = quantidadeAutorizadaOuSolicitada(solicitacao, 'atz_subten_sgt', 'solic_subten_sgt');
            const atzCbSd = quantidadeAutorizadaOuSolicitada(solicitacao, 'atz_cb_sd', 'solic_cb_sd');
            const atzSuperior = quantidadeAutorizadaOuSolicitada(solicitacao, 'atz_superior', 'solic_superior');
            const atzIntermed = quantidadeAutorizadaOuSolicitada(solicitacao, 'atz_intermed', 'solic_intermed');
            const atzSubalterno = quantidadeAutorizadaOuSolicitada(solicitacao, 'atz_subalterno', 'solic_subalterno');

            const escaladoSubten = solicitacao.esc_subten_sgt || 0;
            const escaladoCbSd = solicitacao.esc_cb_sd || 0;
            const escSuperior = solicitacao.esc_superior || 0;
            const escIntermed = solicitacao.esc_intermed || 0;
            const escSubalterno = solicitacao.esc_subalterno || 0;

            const subtenClass = (escaladoSubten < atzSubten) ? 'text-danger fw-bold' : '';
            const cbSdClass = (escaladoCbSd < atzCbSd) ? 'text-danger fw-bold' : '';
            const subalternoClass = (escSubalterno < atzSubalterno) ? 'text-danger fw-bold' : '';
            const intermedClass = (escIntermed < atzIntermed) ? 'text-danger fw-bold' : '';
            const superiorClass = (escSuperior < atzSuperior) ? 'text-danger fw-bold' : '';

            let prazoHTML = '-';
            if (solicitacao.Prazo_Inscricao) {
                try {
                    const [dataPart, horaPart] = String(solicitacao.Prazo_Inscricao).split(' ');
                    if (dataPart && horaPart) {
                        const [dia, mes, ano] = dataPart.split('/');
                        const [horas, minutos] = horaPart.split(':');
                        prazoHTML = `${dia}/${mes} | ${horas}:${minutos}`;
                    }
                } catch (e) {}
            }

            let composicaoNome = solicitacao.composicao_nome || '';
            let composicaoTruncated = composicaoNome;
            let composicaoTitle = '';

            if (composicaoNome.length > 15) {
                composicaoTruncated = composicaoNome.substring(0, 13) + '...';
                composicaoTitle = composicaoNome;
            }

            const idSistema = solicitacao.ID_Escala || '-';
            let idTruncated = idSistema;
            let idTitle = '';

            if (idSistema.length > 8 && idSistema !== '-') {
                idTruncated = idSistema.substring(0, 6) + '...';
                idTitle = idSistema;
            }

            const horarioFormatado = solicitacao.horario_inicial && solicitacao.horario_final
                ? `${solicitacao.horario_inicial} às ${solicitacao.horario_final}`
                : '-';

            html += `
                <tr class="${statusClass} align-middle" id="linha-${solicitacao.id.replace(/\//g, '_')}">
                    <td class="px-1 py-2 text-center">
                        ${acoesHTML}
                    </td>

                    <td class="px-1 py-2 text-center">
                        <a href="#" class="link-reutilizar text-decoration-none truncate-link"
                           data-id="${solicitacao.id}"
                           data-fulltext="Clique para reutilizar estes dados"
                           title="Clique para reutilizar estes dados">
                            <span class="fw-semibold">
                                ${dataFormatada}
                            </span>
                        </a>
                    </td>

                    <td class="px-1 py-2 text-center">
                        <span class="truncate-text" data-fulltext="${composicaoNome}">
                            ${composicaoNome}
                        </span>
                    </td>

                    <td class="px-1 py-2 text-center">
                        <code class="bg-light px-1 py-0 rounded truncate-text" data-fulltext="${solicitacao.composicao_cod || ''}">
                            ${solicitacao.composicao_cod || ''}
                        </code>
                    </td>

                    <td class="px-1 py-2 text-center">
                        <span class="truncate-text" data-fulltext="${horarioFormatado}">
                            ${horarioFormatado}
                        </span>
                    </td>

                    <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto" data-vaga="cbsd">
                        ${exibirQuantidadeSolicitadaAutorizada(solicitacao, 'solic_cb_sd', 'atz_cb_sd')}
                    </td>

                    <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto" data-vaga="sgt">
                        ${exibirQuantidadeSolicitadaAutorizada(solicitacao, 'solic_subten_sgt', 'atz_subten_sgt')}
                    </td>

                    ${isAdmin ? `
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto">${exibirQuantidadeSolicitadaAutorizada(solicitacao, 'solic_subalterno', 'atz_subalterno')}</td>
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto">${exibirQuantidadeSolicitadaAutorizada(solicitacao, 'solic_intermed', 'atz_intermed')}</td>
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto">${exibirQuantidadeSolicitadaAutorizada(solicitacao, 'solic_superior', 'atz_superior')}</td>
                    ` : ''}

                    <td class="px-1 py-2 text-center">
                        <div class="d-flex justify-content-center">
                            ${prioridadeIcon}
                        </div>
                    </td>

                    <td class="px-1 py-2 text-center">
                        <span class="status-icon" data-id="${solicitacao.id}"
                            data-status="${solicitacao.Status_Inicial || ''}"
                            title="${statusTooltip}"
                            style="cursor: ${userDataCache.nivel === 1 && [1, 2, 3].includes(solicitacao.Status_Inicial) ? 'pointer' : 'default'};
                                    font-size: 1.3em; display: inline-block;">
                            ${statusIcon}
                        </span>
                    </td>

                    <td class="px-1 py-2 text-center">
                        ${idSistema !== '-' ? `
                            <a href="#" class="link-id-escala text-decoration-none fw-bold truncate-link"
                               data-id="${idSistema}"
                               data-data="${solicitacao.data}"
                               data-fulltext="${idSistema}"
                               title="Clique para ver militares escalados">
                                ${idSistema}
                            </a>
                        ` : '<span class="text-muted truncate-text">-</span>'}
                    </td>

                    <td class="px-1 py-2 text-center">
                        <small class="truncate-text" data-fulltext="${prazoHTML}">
                            ${prazoHTML}
                        </small>
                    </td>

                    <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto ${cbSdClass}">
                        ${escaladoCbSd}
                    </td>

                    <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto ${subtenClass}">
                        ${escaladoSubten}
                    </td>

                    ${isAdmin ? `
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto ${subalternoClass}">${escSubalterno}</td>
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto ${intermedClass}">${escIntermed}</td>
                        <td class="px-1 py-2 text-center fw-bold vagas-cell col-posto ${superiorClass}">${escSuperior}</td>
                    ` : ''}

                    <td class="px-1 py-2 text-center">
                        <button class="btn btn-sm btn-outline-info btn-detalhes"
                                data-id="${solicitacao.id}"
                                title="Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        adicionarEventListenersTabela();
        configurarReutilizacaoDados();
        configurarLinksIdEscala();

    } catch (error) {
        console.error('Erro ao atualizar tabela:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="20" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i><br>
                    Erro ao carregar solicitações<br>
                    <small>${error.message}</small>
                </td>
            </tr>
        `;
    } finally {
        atualizarBloqueioFormularioPorTabela();
    }
}

function posicionarAcoesTesteNoNavbar() {
    const destino = document.getElementById('navbarSolicitacoesTesteAcoes');
    if (!destino) return;

    // Remove somente as cópias do conteúdo da página; os controles do navbar permanecem.
    document.querySelectorAll('#notificacoes-dropdown, #liberacoes-dropdown').forEach((controle) => {
        if (!destino.contains(controle)) controle.remove();
    });

    const mostrarAcoes = Number(userDataCache?.nivel) === 1;
    destino.classList.toggle('d-none', !mostrarAcoes);
    destino.classList.toggle('d-flex', mostrarAcoes);
    destino.style.setProperty('display', mostrarAcoes ? 'flex' : 'none', 'important');
}

function atualizarCardsResumoSolicitacoes(solicitacoes) {
    const getNumero = (valor) => {
        const numero = parseInt(valor, 10);
        return Number.isNaN(numero) ? 0 : numero;
    };

    const totais = solicitacoes.reduce((acc, solicitacao) => {
        // Status 3 e 5 representam cancelamentos/exclusoes e nao entram nos totais.
        const status = Number(solicitacao.Status_Inicial ?? solicitacao.status);
        if (status === 3 || status === 5) return acc;
        acc.subSgtSolicitado += getNumero(solicitacao.solic_subten_sgt);
        acc.subSgtEscalados += getNumero(solicitacao.esc_subten_sgt);
        acc.cbSdSolicitado += getNumero(solicitacao.solic_cb_sd);
        acc.cbSdEscalados += getNumero(solicitacao.esc_cb_sd);
        return acc;
    }, {
        subSgtSolicitado: 0,
        subSgtEscalados: 0,
        cbSdSolicitado: 0,
        cbSdEscalados: 0
    });

    const subSgtDiferenca = totais.subSgtSolicitado - totais.subSgtEscalados;
    const cbSdDiferenca = totais.cbSdSolicitado - totais.cbSdEscalados;
    const totalSolicitado = totais.subSgtSolicitado + totais.cbSdSolicitado;
    const totalEscalados = totais.subSgtEscalados + totais.cbSdEscalados;
    const totalDiferenca = subSgtDiferenca + cbSdDiferenca;

    const setTexto = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    };

    setTexto('resumoSubSgtSolicitado', totais.subSgtSolicitado);
    setTexto('resumoSubSgtEscalados', totais.subSgtEscalados);
    setTexto('resumoSubSgtDiferenca', subSgtDiferenca);

    setTexto('resumoCbSdSolicitado', totais.cbSdSolicitado);
    setTexto('resumoCbSdEscalados', totais.cbSdEscalados);
    setTexto('resumoCbSdDiferenca', cbSdDiferenca);

    setTexto('resumoTotalSolicitado', totalSolicitado);
    setTexto('resumoTotalEscalados', totalEscalados);
    setTexto('resumoTotalDiferenca', totalDiferenca);
}

// FUNÇÃO: Gerar HTML das ações
function gerarAcoesHTMLMelhorado(solicitacao) {
    const isAdmin = userDataCache.nivel === 1;
    const isModerador = userDataCache.nivel === 2;
    const podeAcessarOPM = opmsPermitidas.includes(solicitacao.opm_codigo);

    if (isAdmin && solicitacao.pedido_liberacao_edicao) {
        return `
            <button class="btn btn-sm btn-warning btn-analisar-liberacao" data-id="${solicitacao.id}" title="Analisar solicitacao de liberacao">
                <i class="fas fa-clipboard-check"></i>
            </button>
        `;
    }

    if (false && isAdmin && solicitacao.pedido_liberacao_edicao) {
        return `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-sm btn-success btn-aprovar-liberacao" data-id="${solicitacao.id}" title="Aprovar liberação">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-cancelar-pedido-liberacao" data-id="${solicitacao.id}" title="Cancelar solicitação de liberação">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    if (solicitacao.liberacao_quantidade) {
        const podeEditarQuantidade = isAdmin || (isModerador && podeAcessarOPM);
        if (!podeEditarQuantidade) return '';

        return `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-sm btn-outline-primary btn-editar" data-id="${solicitacao.id}" title="Editar quantidade de vagas">
                    <i class="fas fa-edit"></i>
                </button>
                ${isAdmin ? `
                    <button class="btn btn-sm btn-outline-warning btn-cancelar-liberacao" data-id="${solicitacao.id}" title="Bloquear novamente e restaurar o status anterior">
                        <i class="fas fa-lock"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }

    if (podeSolicitarLiberacaoQuantidade(solicitacao)) {
        return `
            <button class="btn btn-sm btn-outline-warning btn-solicitar-liberacao" data-id="${solicitacao.id}" title="Solicitar liberação para editar quantidade">
                <i class="fas fa-bullhorn"></i>
            </button>
        `;
    }

    if ([1, 2, 3].includes(solicitacao.Status_Inicial)) {
        return '';
    }

    if (Number(solicitacao.Status_Inicial ?? solicitacao.status) === 5) {
        if (isAdmin) {
            return `
                <button class="btn btn-sm btn-success btn-reativar" data-id="${solicitacao.id}" title="Reativar">
                    <i class="fas fa-undo"></i>
                </button>
            `;
        }
        return '';
    }

    const podeEditar = (isAdmin || (isModerador && podeAcessarOPM));

    if (!podeEditar) return '';

    if (solicitacao.Status_Inicial === 4 || !solicitacao.Status_Inicial) {
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

    return '';
}

// FUNÇÃO: Adicionar event listeners à tabela
function adicionarEventListenersTabela() {
    document.querySelectorAll('.btn-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            mostrarDetalhesSolicitacao(id);
        });
    });

    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.status-icon').forEach(span => {
            span.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const status = e.currentTarget.dataset.status;

                if (['1', '2', '3'].includes(status)) {
                    liberarParaEdicaoAdmin(id, status);
                } else if (status === '4') {
                    liberarParaEdicao(id);
                }
            });
        });
    }

    if (userDataCache.nivel <= 2) {
        document.querySelectorAll('.btn-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                iniciarEdicao(id);
            });
        });

        document.querySelectorAll('.btn-excluir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                excluirSolicitacao(id);
            });
        });

        document.querySelectorAll('.btn-atualizar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                confirmarEdicao(id);
            });
        });

        document.querySelectorAll('.btn-cancelar-edicao').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                cancelarEdicao(id);
            });
        });
    }

    if (userDataCache.nivel === 1 || userDataCache.nivel === 2) {
        document.querySelectorAll('.btn-reativar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                reativarSolicitacao(id);
            });
        });
    }

    document.querySelectorAll('.btn-solicitar-liberacao').forEach(btn => {
        btn.addEventListener('click', (e) => abrirModalSolicitarLiberacao(e.currentTarget.dataset.id));
    });

    if (userDataCache.nivel === 1) {
        document.querySelectorAll('.btn-analisar-liberacao').forEach(btn => {
            btn.addEventListener('click', (e) => abrirModalAnaliseLiberacao(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.btn-cancelar-liberacao').forEach(btn => {
            btn.addEventListener('click', (e) => cancelarLiberacaoQuantidade(e.currentTarget.dataset.id));
        });
    }

    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            reutilizarDadosSolicitacao(id);
        });
    });
}

// FUNÇÃO: Configurar reutilização de dados
function configurarReutilizacaoDados() {
    document.querySelectorAll('.link-reutilizar').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const id = e.currentTarget.dataset.id;
            await reutilizarDadosSolicitacao(id);
        });
    });
}

// FUNÇÃO: Reutilizar dados
async function reutilizarDadosSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) {
        mostrarMensagemFormulario('Solicitação não encontrada', 'danger');
        return;
    }

    try {
        document.getElementById('selectComposicao').value = solicitacao.composicao_cod;
        document.getElementById('inputHorarioInicial').value = solicitacao.horario_inicial;
        const necessidade = solicitacao.necessidade ?? '';
        document.getElementById('selectPrioridade').value = necessidade;
        document.getElementById('inputSolicSubtenSgt').value = solicitacao.solic_subten_sgt;
        document.getElementById('inputSolicCbSd').value = solicitacao.solic_cb_sd;
        document.getElementById('inputMotivo').value = solicitacao.motivo || '';
        document.getElementById('inputObservacoes').value = solicitacao.observacoes || '';
        document.getElementById('inputData').value = '';

        atualizarDiasMes();
        calcularHorarioFinal();
        atualizarCampoAnexo(necessidade);

        document.getElementById('formNovaSolicitacao').scrollIntoView({ behavior: 'smooth' });

        mostrarMensagemFormulario('✅ Dados carregados! Agora selecione uma nova data.', 'success');

    } catch (error) {
        console.error('Erro ao reutilizar dados:', error);
        mostrarMensagemFormulario('❌ Erro ao carregar dados', 'danger');
    }
}

// FUNÇÃO: Configurar links de ID da escala
function configurarLinksIdEscala() {
    document.querySelectorAll('.link-id-escala').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const idSistema = e.currentTarget.dataset.id;
            const dataSolicitacao = e.currentTarget.dataset.data;

            if (idSistema && idSistema !== '-' && idSistema !== '') {
                buscarEscaladosModal(idSistema, dataSolicitacao);
            }
        });
    });
}

// FUNÇÃO: Funções auxiliares de Ícones
function getIconeStatus(status) {
    switch(status) {
        case 1: return '<i class="fas fa-check-circle text-success"></i>';
        case 2: return '<i class="fas fa-exclamation-triangle text-warning"></i>';
        case 3: return '<i class="fas fa-times-circle text-danger"></i>';
        case 4: return '<i class="fas fa-hand-paper text-warning"></i>';
        case 5: return '<i class="fas fa-trash-alt text-secondary"></i>';
        default: return '';
    }
}

function getClasseStatus(status) {
    switch(status) {
        case 4: return 'table-warning';
        case 5: return 'table-danger';
        default: return '';
    }
}

function getIconePrioridadeCompleto(prioridade) {
    switch(prioridade) {
        case 'minimo_operacional':
            return '<span class="badge bg-success" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Mínimo</span>';
        case 'vistoria_tecnica':
            return '<span class="badge bg-warning text-dark" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Vistoria</span>';
        case 'viatura_extra':
            return '<span class="badge bg-info" style="font-size: 0.8rem; padding: 4px 8px; white-space: nowrap;">Extra</span>';
        default:
            return '<span class="badge bg-secondary" style="font-size: 0.8rem; padding: 4px 8px;">-</span>';
    }
}

// FUNÇÃO: Obter URL do anexo via nó anexos
async function obterUrlAnexoSolicitacao(solicitacao) {
    if (!solicitacao?.id || !solicitacao?.comprovante_anexo) return null;

    try {
        const numeroAnexo = String(solicitacao.comprovante_anexo).padStart(2, '0');
        const partesId = solicitacao.id.split('/');
        if (partesId.length < 4) return null;

        const [ano, mes, opmCodigo, composicaoCod] = partesId;
        const caminho = `solicitacoes/${ano}/${mes}/${opmCodigo}/${composicaoCod}/anexos/${numeroAnexo}/url`;
        const anexoRef = ref(database, caminho);
        const snapshot = await get(anexoRef);

        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.warn('Não foi possível obter URL do anexo de referência:', error);
        return null;
    }
}

// FUNÇÃO: Mostrar detalhes da solicitação
function rotuloNecessidadeSolicitacao(valor) {
    const rotulos = {
        viatura_extra: 'Viatura extra',
        minimo_operacional: 'Mínimo operacional',
        vistoria_tecnica: 'Vistoria técnica'
    };
    const chave = String(valor ?? '').trim().toLowerCase();
    return rotulos[chave] || (valor ? String(valor) : 'Não informada');
}

function formatarDataHoraSolicitacao(valor) {
    if (!valor) return 'Não informada';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

async function mostrarDetalhesSolicitacao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;

    const modalId = `modalDetalhes-${Date.now()}`;

    let anexoHTML = '<small class="text-muted">Nenhum anexo</small>';
    const urlAnexoReferencia = await obterUrlAnexoSolicitacao(solicitacao);

    if (solicitacao.comprovante_anexo) {
        if (urlAnexoReferencia) {
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo (${solicitacao.comprovante_anexo}):</strong></label>
                    <div>
                        <a href="${urlAnexoReferencia}" target="_blank" class="btn btn-sm btn-primary">
                            <i class="fas fa-external-link-alt me-1"></i>Visualizar Anexo
                        </a>
                    </div>
                </div>
            `;
        } else {
            anexoHTML = `
                <div class="mb-3">
                    <label class="form-label"><strong>Anexo (${solicitacao.comprovante_anexo}):</strong></label>
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        URL do anexo não disponível no nó anexos.
                    </div>
                </div>
            `;
        }
    }

    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
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
                                <strong>Data:</strong> ${(() => {
                                    try {
                                        const dataObj = new Date(solicitacao.data);
                                        const dataAjustada = new Date(dataObj.getTime() + (3 * 60 * 60 * 1000));
                                        return dataAjustada.toLocaleDateString('pt-BR');
                                    } catch (e) {
                                        return solicitacao.data || 'Data inválida';
                                    }
                                })()}<br>
                                <strong>Horário:</strong> ${solicitacao.horario_inicial} às ${solicitacao.horario_final}<br>
                                <strong>OPM:</strong> ${solicitacao.opm_nome} (${solicitacao.opm_codigo})<br>
                            </div>
                            <div class="col-md-6">
                                <strong>Vagas solicitadas:</strong><br>
                                <span class="ms-2">Sup: ${Number(solicitacao.solic_superior || 0)}</span> |
                                <span>Cap: ${Number(solicitacao.solic_intermed || 0)}</span> |
                                <span>Ten: ${Number(solicitacao.solic_subalterno || 0)}</span><br>
                                <span class="ms-2">Sub/Sgt: ${Number(solicitacao.solic_subten_sgt || 0)}</span> |
                                <span>Cb/Sd: ${Number(solicitacao.solic_cb_sd || 0)}</span><br>
                                <strong>Necessidade:</strong> ${escaparHTML(rotuloNecessidadeSolicitacao(solicitacao.necessidade))}<br>
                                <strong>Composição:</strong> ${solicitacao.composicao_nome} (${solicitacao.composicao_cod})
                            </div>
                        </div>

                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Solicitado por:</strong>
                                ${escaparHTML(solicitacao.criado_por_nome || 'Não informado')}
                                ${solicitacao.criado_por_re ? ` (RE ${escaparHTML(solicitacao.criado_por_re)})` : ''}
                            </div>
                            <div class="col-md-6">
                                <strong>Data/hora da solicitação:</strong>
                                ${escaparHTML(formatarDataHoraSolicitacao(solicitacao.criado_em))}
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label"><strong>Motivo:</strong></label>
                            <textarea class="form-control" id="modalMotivo${modalId}" rows="2">${solicitacao.motivo || ''}</textarea>
                        </div>

                        <div class="mb-3">
                            <label class="form-label"><strong>Observações:</strong></label>
                            <textarea class="form-control" id="modalObservacoes${modalId}" rows="2">${solicitacao.observacoes || ''}</textarea>
                        </div>

                        ${anexoHTML}

                        ${userDataCache.nivel === 1 ? `
                        <div class="mb-3">
                            <label class="form-label"><strong>Administração:</strong></label>
                            <textarea class="form-control" id="modalAdministracao${modalId}" rows="2">${solicitacao.administracao || ''}</textarea>
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        <button type="button" class="btn btn-primary" id="btnSalvarDetalhes${modalId}">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const btnSalvar = document.getElementById(`btnSalvarDetalhes${modalId}`);
    if (btnSalvar) {
        btnSalvar.onclick = () => salvarDetalhesSolicitacao(id, modalContainer, modalId);
    }

    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
            if (modalContainer.parentNode) {
                modalContainer.parentNode.removeChild(modalContainer);
            }
        }, 300);
    });
}

// FUNÇÃO: Download base64 (mantido para compatibilidade)
function downloadBase64(base64Data, filename) {
    try {
        const parts = base64Data.split(';base64,');
        const mimeType = parts[0].split(':')[1];
        const data = parts[1];

        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: mimeType});

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

// FUNÇÃO: Salvar detalhes
async function salvarDetalhesSolicitacao(id, modalContainer, modalId) {
    try {
        const podeAlterar = await validarStatusParaAlteracao(id, { modalId });
        if (!podeAlterar) return;

        const solicitacao = solicitacoesCache.find(s => s.id === id);
        if (!solicitacao) return;

        const podeEditar = (
            userDataCache.nivel === 1 ||
            (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo))
        );

        if (!podeEditar) {
            mostrarMensagemFormulario('Você não tem permissão para editar esta solicitação', 'danger');
            return;
        }

        const motivo = document.getElementById(`modalMotivo${modalId}`).value;
        const observacoes = document.getElementById(`modalObservacoes${modalId}`).value;

        const solicitacaoRef = ref(database, `solicitacoes/${id}`);

        if (!solicitacao.Status_Inicial || solicitacao.Status_Inicial !== 4) {
            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                motivo_anterior: solicitacao.motivo || '',
                observacoes_anteriores: solicitacao.observacoes || ''
            });
            await update(historicoRef, entradaHistorico);

            await update(solicitacaoRef, {
                Status_Inicial: 4,
                motivo: motivo,
                observacoes: observacoes,
                liberacao_quantidade: null
            });

            mostrarMensagemFormulario('Detalhes atualizados. Solicitação em modo de edição.', 'info');

        } else {
            const updates = {
                motivo: motivo,
                observacoes: observacoes
            };

            if (userDataCache.nivel === 1) {
                const administracao = document.getElementById(`modalAdministracao${modalId}`).value;
                updates.administracao = administracao;
            }

            await update(solicitacaoRef, updates);

            const historicoRef = ref(database, `solicitacoes/${id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                campos_alterados: Object.keys(updates)
            });
            await update(historicoRef, entradaHistorico);

            mostrarMensagemFormulario('Detalhes atualizados! Solicitação continua em edição.', 'success');
        }

        await registrarPendenciaSolicitacao(id, {
            ...solicitacao,
            motivo,
            observacoes,
            Status_Inicial: 4
        });

        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].motivo = motivo;
            solicitacoesCache[index].observacoes = observacoes;
            if (userDataCache.nivel === 1) {
                solicitacoesCache[index].administracao = document.getElementById(`modalAdministracao${modalId}`).value;
            }
        }

        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();

        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();

    } catch (error) {
        console.error('Erro ao salvar detalhes:', error);
        mostrarMensagemFormulario('❌ Erro ao salvar detalhes', 'danger');
    }
}

// FUNÇÃO: Validar status atual no Firebase antes de alterar
async function validarStatusParaAlteracao(id, options = {}) {
    const { modalId = null } = options;

    const solicitacaoRef = ref(database, `solicitacoes/${id}`);
    const solicitacaoSnapshot = await get(solicitacaoRef);
    const dadosSolicitacao = solicitacaoSnapshot.val() || {};
    const statusAtual = Number(dadosSolicitacao.Status_Inicial ?? dadosSolicitacao.status ?? null);

    if ([1, 2, 3].includes(statusAtual)) {
        alert('Não foi possível alterar os dados, pois esta solicitação já foi processada. A tabela será atualizada.');

        if (modalId) {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
                modalInstance.hide();
            }
        }

        const tabelaSolicitacoes = document.getElementById('tabelaSolicitacoes');
        if (tabelaSolicitacoes) {
            await carregarSolicitacoesMes();
            atualizarTabelaSolicitacoes();
        }

        return false;
    }

    return true;
}

// FUNÇÃO: Iniciar edição
async function iniciarEdicao(id) {
    const solicitacao = solicitacoesCache.find(s => s.id === id);
    if (!solicitacao) return;

    const podeEditar = (
        userDataCache.nivel === 1 ||
        (userDataCache.nivel === 2 && opmsPermitidas.includes(solicitacao.opm_codigo) &&
         ![1, 2, 3].includes(solicitacao.Status_Inicial))
    );

    if (!podeEditar) {
        mostrarMensagemFormulario('Você não tem permissão para editar esta solicitação', 'danger');
        return;
    }

    try {
        transformarCelulasEmInputs(id, solicitacao);
        atualizarBotoesParaModoEdicao(id);
        mostrarMensagemFormulario('Editando solicitação - Clique em "Atualizar" para confirmar', 'info');
    } catch (error) {
        console.error('Erro ao iniciar edição:', error);
        mostrarMensagemFormulario('Erro ao iniciar edição', 'danger');
    }
}

// FUNÇÃO: Transformar células em inputs
function transformarCelulasEmInputs(id, solicitacao) {
    const linhaId = `linha-${id.replace(/\//g, '_')}`;
    const linha = document.getElementById(linhaId);
    if (!linha) return;

    const celulaSubten = linha.querySelector('[data-vaga="sgt"]');
    const celulaCbSd = linha.querySelector('[data-vaga="cbsd"]');
    if (!celulaSubten || !celulaCbSd) return;

    celulaSubten.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center"
               id="editSubten${linhaId}"
               value="${solicitacao.solic_subten_sgt || 0}"
               min="0" max="99" style="width: 4.5ch;">
    `;

    celulaCbSd.innerHTML = `
        <input type="number" class="form-control form-control-sm text-center"
               id="editCbSd${linhaId}"
               value="${solicitacao.solic_cb_sd || 0}"
               min="0" max="99" style="width: 4.5ch;">
    `;
}

// FUNÇÃO: Atualizar botões para modo edição
function atualizarBotoesParaModoEdicao(id) {
    const linhaId = `linha-${id.replace(/\//g, '_')}`;
    const linha = document.getElementById(linhaId);
    if (!linha) return;

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

    const btnAtualizar = linha.querySelector('.btn-atualizar');
    const btnCancelar = linha.querySelector('.btn-cancelar-edicao');

    if (btnAtualizar) btnAtualizar.onclick = () => confirmarEdicao(id);
    if (btnCancelar) btnCancelar.onclick = () => cancelarEdicao(id);
}

// FUNÇÃO: Confirmar edição
async function confirmarEdicao(id) {
    try {
        const podeAlterar = await validarStatusParaAlteracao(id);
        if (!podeAlterar) return;

        const linhaId = `linha-${id.replace(/\//g, '_')}`;

        const inputSubten = document.getElementById(`editSubten${linhaId}`);
        const inputCbSd = document.getElementById(`editCbSd${linhaId}`);

        if (!inputSubten || !inputCbSd) {
            throw new Error('Não foi possível encontrar os campos de edição');
        }

        const novasVagasSubten = parseInt(inputSubten.value) || 0;
        const novasVagasCbSd = parseInt(inputCbSd.value) || 0;

        if (novasVagasSubten < 0 || novasVagasCbSd < 0) {
            mostrarMensagemFormulario('As vagas não podem ser negativas', 'danger');
            return;
        }

        const solicitacaoAtual = solicitacoesCache.find(s => s.id === id);
        if (!solicitacaoAtual) return;

        const solicitacaoRef = ref(database, `solicitacoes/${id}`);

        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            vagas_anteriores: {
                subten_sgt: solicitacaoAtual.solic_subten_sgt,
                cb_sd: solicitacaoAtual.solic_cb_sd
            },
        });
        await update(historicoRef, entradaHistorico);

        await update(solicitacaoRef, {
            Solic_Subten_Sgt: novasVagasSubten,
            Solic_Cb_Sd: novasVagasCbSd,
            Status_Inicial: 4,
            liberacao_quantidade: null
        });

        await registrarPendenciaSolicitacao(id, {
            ...solicitacaoAtual,
            Solic_Subten_Sgt: novasVagasSubten,
            Solic_Cb_Sd: novasVagasCbSd,
            Status_Inicial: 4
        });

        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].Solic_Subten_Sgt = novasVagasSubten;
            solicitacoesCache[index].Solic_Cb_Sd = novasVagasCbSd;
            solicitacoesCache[index].Status_Inicial = 4;
        }

        solicitacoesCache = [];
        await carregarSolicitacoesMes();
        await atualizarTabelaSolicitacoes();

        mostrarMensagemFormulario('Vagas atualizadas! Solicitação agora está em modo de edição (status 4).', 'success');

    } catch (error) {
        console.error('Erro ao confirmar edição:', error);
        mostrarMensagemFormulario('❌ Erro ao atualizar vagas', 'danger');
    }
}

// FUNÇÃO: Cancelar edição
async function atualizarTelaAposLiberacao() {
    await carregarSolicitacoesMes();
    await atualizarTabelaSolicitacoes();
    await carregarLiberacoesPendentes();
}

function formatarPrazoLiberacao(data, hora, minuto) {
    if (!data && !hora && !minuto) return '';
    if (!data || hora === '' || minuto === '') return null;
    const partes = String(data).split('-');
    if (partes.length !== 3) return null;
    return `${partes[2]}/${partes[1]}/${partes[0]} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

function opcoesNumericas(inicio, fim) {
    let html = '<option value="">--</option>';
    for (let valor = inicio; valor <= fim; valor++) {
        const texto = String(valor).padStart(2, '0');
        html += `<option value="${texto}">${texto}</option>`;
    }
    return html;
}

function fecharModalLiberacao(container, modalId) {
    const elemento = document.getElementById(modalId);
    const modal = elemento ? bootstrap.Modal.getInstance(elemento) : null;
    if (modal) modal.hide();
    setTimeout(() => container?.remove(), 250);
}

function abrirModalSolicitarLiberacao(id) {
    const solicitacao = solicitacoesCache.find((item) => item.id === id);
    if (!solicitacao || !podeSolicitarLiberacaoQuantidade(solicitacao)) {
        mostrarMensagemFormulario('Esta escala não pode mais solicitar liberação.', 'warning');
        return;
    }

    const modalId = `modalSolicitarLiberacao-${Date.now()}`;
    const container = document.createElement('div');
    container.innerHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
                <div class="modal-header bg-warning">
                    <h5 class="modal-title"><i class="fas fa-bullhorn me-2"></i>Solicitar liberação</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p>Solicite ao administrador a liberação desta escala para alterar a quantidade de vagas.</p>
                    <div class="alert alert-info small">Se nenhum prazo for informado, o prazo atual será mantido e a solicitação ficará somente para alteração de quantidade.</div>
                    <div class="row g-2">
                        <div class="col-12"><label class="form-label fw-semibold">Novo prazo de inscrição (opcional)</label><input type="date" class="form-control" id="prazoData${modalId}"></div>
                        <div class="col-6"><label class="form-label">Hora</label><select class="form-select" id="prazoHora${modalId}">${opcoesNumericas(0, 23)}</select></div>
                        <div class="col-6"><label class="form-label">Minuto</label><select class="form-select" id="prazoMinuto${modalId}">${opcoesNumericas(0, 59)}</select></div>
                        <div class="col-12"><label class="form-label">Observação (opcional)</label><textarea class="form-control" id="observacaoLiberacao${modalId}" rows="3" maxlength="500"></textarea></div>
                    </div>
                </div>
                <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-warning" id="enviarLiberacao${modalId}">Enviar solicitação</button></div>
            </div></div>
        </div>`;
    document.body.appendChild(container);
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    document.getElementById(`enviarLiberacao${modalId}`).onclick = async () => {
        const data = document.getElementById(`prazoData${modalId}`).value;
        const hora = document.getElementById(`prazoHora${modalId}`).value;
        const minuto = document.getElementById(`prazoMinuto${modalId}`).value;
        const prazo = formatarPrazoLiberacao(data, hora, minuto);
        const observacao = document.getElementById(`observacaoLiberacao${modalId}`).value.trim();
        if (prazo === null) {
            mostrarMensagemFormulario('Preencha a data, a hora e o minuto do prazo ou deixe todos vazios.', 'warning');
            return;
        }

        const botao = document.getElementById(`enviarLiberacao${modalId}`);
        botao.disabled = true;
        try {
            const anoMes = obterAnoMesSolicitacao(solicitacao);
            if (!anoMes) throw new Error('Mês da solicitação não identificado.');
            const pedido = {
                id_firebase: id,
                opm_codigo: solicitacao.opm_codigo || '',
                opm_nome: solicitacao.opm_nome || '',
                composicao_cod: solicitacao.composicao_cod || '',
                composicao_nome: solicitacao.composicao_nome || '',
                data: solicitacao.data || '',
                horario_inicial: solicitacao.horario_inicial || '',
                prazo_inscricao_solicitado: prazo || null,
                observacoes_liberacao: observacao || '',
                status_inicial_anterior: solicitacao.Status_Inicial ?? null,
                solicitado_por_re: userRE || '',
                solicitado_por_nome: userDataCache?.nome || '',
                solicitado_em: new Date().toISOString()
            };
            const atualizacoes = {};
            atualizacoes[`solicitacoes/${id}/pedido_liberacao_edicao`] = pedido;
            atualizacoes[`SolicLiberacaoPendentes/${pedido.opm_codigo}/${anoMes.ano}${anoMes.mes}/${chavePedidoLiberacao(id)}`] = pedido;
            await update(ref(database), atualizacoes);
            await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({
                observacao: prazo ? 'Solicitada liberação com novo prazo de inscrição' : 'Solicitada liberação para alteração de quantidade',
                prazo_inscricao_solicitado: prazo || null,
                observacoes_liberacao: observacao || ''
            }));
            fecharModalLiberacao(container, modalId);
            mostrarMensagemFormulario('Solicitação de liberação enviada ao administrador.', 'success');
            await atualizarTelaAposLiberacao();
        } catch (error) {
            console.error('Erro ao solicitar liberação:', error);
            botao.disabled = false;
            mostrarMensagemFormulario('Não foi possível solicitar a liberação.', 'danger');
        }
    };
    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => setTimeout(() => container.remove(), 250), { once: true });
}

async function abrirModalAnaliseLiberacao(id) {
    const solicitacao = solicitacoesCache.find((item) => item.id === id);
    if (Number(userDataCache?.nivel) !== 1 || !solicitacao?.pedido_liberacao_edicao) return;
    const pedido = solicitacao.pedido_liberacao_edicao;
    const modalId = `modalAnaliseLiberacao-${Date.now()}`;
    const container = document.createElement('div');
    const prazoSolicitado = pedido.prazo_inscricao_solicitado || 'Não informado; manter o prazo atual';
    container.innerHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content">
                <div class="modal-header bg-warning"><h5 class="modal-title"><i class="fas fa-clipboard-check me-2"></i>Analisar solicitação de liberação</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <div class="modal-body"><div class="row g-3">
                    <div class="col-md-6"><strong>Solicitante:</strong><br>${escaparHTML(pedido.solicitado_por_nome || '-')} (${escaparHTML(pedido.solicitado_por_re || '-')})</div>
                    <div class="col-md-6"><strong>Solicitado em:</strong><br>${escaparHTML(formatarDataHoraSolicitacao(pedido.solicitado_em) || '-')}</div>
                    <div class="col-md-6"><strong>OPM:</strong><br>${escaparHTML(pedido.opm_nome || pedido.opm_codigo || '-')}</div>
                    <div class="col-md-6"><strong>Composição:</strong><br>${escaparHTML(`${pedido.composicao_cod || ''} - ${pedido.composicao_nome || ''}`)}</div>
                    <div class="col-md-6"><strong>Data da escala:</strong><br>${escaparHTML(pedido.data || '-')} ${escaparHTML(pedido.horario_inicial || '')}</div>
                    <div class="col-md-6"><strong>Prazo atual:</strong><br>${escaparHTML(solicitacao.Prazo_Inscricao || '-')}</div>
                    <div class="col-12"><div class="alert alert-info mb-0"><strong>Prazo solicitado:</strong> ${escaparHTML(prazoSolicitado)}</div></div>
                    <div class="col-12"><strong>Observação:</strong><div class="border rounded p-2 bg-light">${escaparHTML(pedido.observacoes_liberacao || 'Nenhuma observação informada.')}</div></div>
                    <div class="col-12"><label class="form-label">Motivo da recusa (opcional)</label><textarea class="form-control" id="motivoRecusa${modalId}" rows="2"></textarea></div>
                </div></div>
                <div class="modal-footer"><button type="button" class="btn btn-outline-danger" id="recusarLiberacao${modalId}"><i class="fas fa-times me-1"></i>Recusar</button><button type="button" class="btn btn-success" id="liberarSolicitacao${modalId}"><i class="fas fa-check me-1"></i>Liberar</button></div>
            </div></div>
        </div>`;
    document.body.appendChild(container);
    new bootstrap.Modal(document.getElementById(modalId)).show();

    document.getElementById(`liberarSolicitacao${modalId}`).onclick = async () => {
        try {
            await concluirLiberacaoQuantidade(id, 'Solicitação liberada pelo administrador');
            fecharModalLiberacao(container, modalId);
            mostrarMensagemFormulario('Solicitação liberada para edição.', 'success');
            await atualizarTelaAposLiberacao();
        } catch (error) {
            console.error('Erro ao liberar solicitação:', error);
            mostrarMensagemFormulario('Não foi possível liberar a solicitação.', 'danger');
        }
    };
    document.getElementById(`recusarLiberacao${modalId}`).onclick = async () => {
        if (!confirm('Tem certeza que deseja recusar esta solicitação de liberação?')) return;
        try {
            const motivo = document.getElementById(`motivoRecusa${modalId}`).value.trim();
            await recusarPedidoLiberacao(id, motivo);
            fecharModalLiberacao(container, modalId);
            mostrarMensagemFormulario('Solicitação de liberação recusada.', 'info');
            await atualizarTelaAposLiberacao();
        } catch (error) {
            console.error('Erro ao recusar solicitação:', error);
            mostrarMensagemFormulario('Não foi possível recusar a solicitação.', 'danger');
        }
    };
    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => setTimeout(() => container.remove(), 250), { once: true });
}

async function recusarPedidoLiberacao(id, motivo = '') {
    const snapshot = await get(ref(database, `solicitacoes/${id}`));
    const dados = snapshot.val() || {};
    const pedido = dados.pedido_liberacao_edicao;
    if (!pedido) return;
    const anoMes = obterAnoMesSolicitacao({ ...dados, id });
    const atualizacoes = { [`solicitacoes/${id}/pedido_liberacao_edicao`]: null };
    if (anoMes && pedido.opm_codigo) atualizacoes[`SolicLiberacaoPendentes/${pedido.opm_codigo}/${anoMes.ano}${anoMes.mes}/${chavePedidoLiberacao(id)}`] = null;
    await update(ref(database), atualizacoes);
    await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({
        observacao: 'Solicitação de liberação recusada pelo administrador',
        motivo_recusa: motivo || ''
    }));
}

async function solicitarLiberacaoQuantidade(id) {
    const solicitacao = solicitacoesCache.find((item) => item.id === id);
    if (!solicitacao || !podeSolicitarLiberacaoQuantidade(solicitacao)) {
        mostrarMensagemFormulario('Esta escala não pode mais solicitar liberação para alteração de quantidade.', 'warning');
        return;
    }

    if (!confirm('Solicitar ao administrador a liberação desta escala para alterar somente as quantidades?')) return;

    try {
        const anoMes = obterAnoMesSolicitacao(solicitacao);
        if (!anoMes) throw new Error('Não foi possível identificar o mês da solicitação.');

        const agora = new Date().toISOString();
        const pedido = {
            id_firebase: id,
            opm_codigo: solicitacao.opm_codigo || '',
            opm_nome: solicitacao.opm_nome || '',
            composicao_cod: solicitacao.composicao_cod || '',
            composicao_nome: solicitacao.composicao_nome || '',
            data: solicitacao.data || '',
            horario_inicial: solicitacao.horario_inicial || '',
            status_inicial_anterior: solicitacao.Status_Inicial ?? null,
            solicitado_por_re: userRE || '',
            solicitado_por_nome: userDataCache?.nome || '',
            solicitado_em: agora
        };

        const atualizacoes = {};
        atualizacoes[`solicitacoes/${id}/pedido_liberacao_edicao`] = pedido;
        atualizacoes[`SolicLiberacaoPendentes/${pedido.opm_codigo}/${anoMes.ano}${anoMes.mes}/${chavePedidoLiberacao(id)}`] = pedido;
        await update(ref(database), atualizacoes);
        await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({
            observacao: 'Solicitada liberação para alteração de quantidade',
            solicitado_por_re: pedido.solicitado_por_re,
            solicitado_por_nome: pedido.solicitado_por_nome
        }));

        mostrarMensagemFormulario('Solicitação de liberação enviada ao administrador.', 'success');
        await atualizarTelaAposLiberacao();
    } catch (error) {
        console.error('Erro ao solicitar liberação:', error);
        mostrarMensagemFormulario('Não foi possível solicitar a liberação.', 'danger');
    }
}

async function cancelarPedidoLiberacao(id) {
    if (!confirm('Cancelar esta solicitação de liberação? A escala permanecerá com o status atual.')) return;

    try {
        const snapshot = await get(ref(database, `solicitacoes/${id}`));
        const dados = snapshot.val() || {};
        const pedido = dados.pedido_liberacao_edicao;
        if (!pedido) {
            mostrarMensagemFormulario('A solicitação de liberação já não está pendente.', 'info');
            await atualizarTelaAposLiberacao();
            return;
        }

        const anoMes = obterAnoMesSolicitacao({ ...dados, id });
        const atualizacoes = { [`solicitacoes/${id}/pedido_liberacao_edicao`]: null };
        if (anoMes && pedido.opm_codigo) {
            atualizacoes[`SolicLiberacaoPendentes/${pedido.opm_codigo}/${anoMes.ano}${anoMes.mes}/${chavePedidoLiberacao(id)}`] = null;
        }
        await update(ref(database), atualizacoes);
        await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({
            observacao: 'Solicitação de liberação cancelada pelo administrador'
        }));

        mostrarMensagemFormulario('Solicitação de liberação cancelada.', 'info');
        await atualizarTelaAposLiberacao();
    } catch (error) {
        console.error('Erro ao cancelar solicitação de liberação:', error);
        mostrarMensagemFormulario('Não foi possível cancelar a solicitação de liberação.', 'danger');
    }
}

function aprovarPedidoLiberacao(id) {
    const solicitacao = solicitacoesCache.find((item) => item.id === id);
    if (!solicitacao?.pedido_liberacao_edicao) return;

    const statusAtual = String(solicitacao.Status_Inicial ?? solicitacao.status ?? '');
    if (['1', '2', '3'].includes(statusAtual)) {
        liberarParaEdicaoAdmin(id, statusAtual);
    } else {
        liberarParaEdicao(id);
    }
}

async function concluirLiberacaoQuantidade(id, observacao) {
    const snapshot = await get(ref(database, `solicitacoes/${id}`));
    const dados = snapshot.val() || {};
    const pedido = dados.pedido_liberacao_edicao || null;
    const statusAnterior = dados.Status_Inicial ?? dados.status ?? null;
    const atualizacoes = {
        [`solicitacoes/${id}/Status_Inicial`]: null,
        [`solicitacoes/${id}/Status_Adm`]: 8
    };

    if (pedido) {
        atualizacoes[`solicitacoes/${id}/pedido_liberacao_edicao`] = null;
        atualizacoes[`solicitacoes/${id}/liberacao_quantidade`] = {
            status_inicial_anterior: pedido.status_inicial_anterior ?? statusAnterior,
            prazo_inscricao_solicitado: pedido.prazo_inscricao_solicitado || null,
            observacoes_liberacao: pedido.observacoes_liberacao || '',
            liberado_por_re: userRE || '',
            liberado_por_nome: userDataCache?.nome || '',
            liberado_em: new Date().toISOString()
        };

        if (pedido.prazo_inscricao_solicitado) {
            atualizacoes[`solicitacoes/${id}/Prazo_Inscricao`] = pedido.prazo_inscricao_solicitado;
        }

        const anoMes = obterAnoMesSolicitacao({ ...dados, id });
        if (anoMes && pedido.opm_codigo) {
            atualizacoes[`SolicLiberacaoPendentes/${pedido.opm_codigo}/${anoMes.ano}${anoMes.mes}/${chavePedidoLiberacao(id)}`] = null;
        }
    }

    await update(ref(database), atualizacoes);
    await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({ observacao }));
}

async function cancelarLiberacaoQuantidade(id) {
    if (!confirm('Cancelar a liberação e restaurar o status anterior da solicitação?')) return;

    try {
        const snapshot = await get(ref(database, `solicitacoes/${id}`));
        const dados = snapshot.val() || {};
        const liberacao = dados.liberacao_quantidade;
        if (!liberacao) {
            mostrarMensagemFormulario('Esta escala não possui uma liberação ativa para cancelar.', 'info');
            return;
        }

        await update(ref(database), {
            [`solicitacoes/${id}/Status_Inicial`]: liberacao.status_inicial_anterior ?? null,
            [`solicitacoes/${id}/liberacao_quantidade`]: null
        });
        await update(ref(database, `solicitacoes/${id}/historico`), criarEntradaHistorico({
            observacao: 'Liberação para alteração de quantidade cancelada; status anterior restaurado'
        }));

        mostrarMensagemFormulario('Liberação cancelada e status anterior restaurado.', 'success');
        await atualizarTelaAposLiberacao();
    } catch (error) {
        console.error('Erro ao cancelar liberação:', error);
        mostrarMensagemFormulario('Não foi possível cancelar a liberação.', 'danger');
    }
}

async function cancelarEdicao(id) {
    try {
        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        mostrarMensagemFormulario('Edição cancelada - Nenhuma alteração foi salva', 'info');
    } catch (error) {
        console.error('Erro ao cancelar edição:', error);
        mostrarMensagemFormulario('Erro ao cancelar edição', 'danger');
    }
}

// FUNÇÃO: Excluir solicitação
async function excluirSolicitacao(id) {
    if (!confirm('Tem certeza que deseja excluir esta solicitação?')) return;

    try {
        const podeAlterar = await validarStatusParaAlteracao(id);
        if (!podeAlterar) return;

        const atualizacoes = {};
        atualizacoes[`solicitacoes/${id}/Status_Inicial`] = 5;
        atualizacoes[`SolicPendentes/${id}`] = null;
        await update(ref(database), atualizacoes);

        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico();
        await update(historicoRef, entradaHistorico);

        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();

        mostrarMensagemFormulario('Solicitação marcada como excluída', 'warning');

    } catch (error) {
        console.error('Erro ao excluir:', error);
        mostrarMensagemFormulario('Erro ao excluir solicitação', 'danger');
    }
}

// FUNÇÃO: Reativar solicitação
async function reativarSolicitacao(id) {
    try {
        if (Number(userDataCache?.nivel) !== 1) {
            mostrarMensagemFormulario('Somente administradores podem reativar solicitações.', 'danger');
            return;
        }

        const podeAlterar = await validarStatusParaAlteracao(id);
        if (!podeAlterar) return;

        const agora = new Date().toISOString();
        const atualizacoes = {};
        atualizacoes[`solicitacoes/${id}/Status_Inicial`] = null;
        atualizacoes[`SolicPendentes/${id}`] = {
            ID_Firebase: id,
            atualizado_em: agora
        };
        await update(ref(database), atualizacoes);

        const historicoRef = ref(database, `solicitacoes/${id}/historico`);
        const entradaHistorico = criarEntradaHistorico({
            observacao: 'Reativada pelo administrador e enviada para pendência de importação'
        });
        await update(historicoRef, entradaHistorico);

        const index = solicitacoesCache.findIndex(s => s.id === id);
        if (index !== -1) {
            solicitacoesCache[index].Status_Inicial = null;
            solicitacoesCache[index].status = null;
        }

        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();
        mostrarMensagemFormulario('Solicitação reativada e enviada para pendência de importação.', 'success');

    } catch (error) {
        console.error('❌ Erro ao reativar:', error);
        mostrarMensagemFormulario('Erro ao reativar solicitação', 'danger');
    }
}

// FUNÇÃO: Liberar para edição
function liberarParaEdicao(id) {
    const modalId = `modalLiberarEdicao-${Date.now()}`;
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
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
                        <button type="button" class="btn btn-warning" id="btnConfirmarLiberar${modalId}">Liberar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const btnConfirmar = document.getElementById(`btnConfirmarLiberar${modalId}`);
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarLiberacao(id, modalContainer, modalId);
    }

    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => modalContainer.remove(), 300);
    });
}

// FUNÇÃO: Liberar para edição admin
function liberarParaEdicaoAdmin(id, statusAtual) {
    const modalId = `modalLiberarEdicaoAdmin-${Date.now()}`;

    const textosStatus = {
        '1': { titulo: 'Desbloquear Solicitação Aprovada', descricao: 'Esta solicitação está LANÇADA NO SISTEMA. Tem certeza que deseja liberar para edição?' },
        '2': { titulo: 'Desbloquear Solicitação Exportada', descricao: 'Esta solicitação está EXPORTADA. Tem certeza que deseja liberar para edição?' },
        '3': { titulo: 'Desbloquear Solicitação Cancelada', descricao: 'Esta solicitação está CANCELADA. Tem certeza que deseja liberar para edição?' }
    };

    const texto = textosStatus[statusAtual] || {
        titulo: 'Liberar para Edição',
        descricao: 'Tem certeza que deseja liberar esta solicitação para edição?'
    };

    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-unlock me-2"></i>
                            ${texto.titulo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${texto.descricao}</p>
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            Após liberar, o status será removido e aparecerão os botões de edição.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-warning" id="btnConfirmarLiberarAdmin${modalId}">Liberar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const btnConfirmar = document.getElementById(`btnConfirmarLiberarAdmin${modalId}`);
    if (btnConfirmar) {
        btnConfirmar.onclick = () => confirmarLiberacaoAdmin(id, modalContainer, modalId);
    }

    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    document.getElementById(modalId).addEventListener('hidden.bs.modal', () => {
        setTimeout(() => {
            if (modalContainer.parentNode) {
                modalContainer.parentNode.removeChild(modalContainer);
            }
        }, 300);
    });
}

// FUNÇÃO: Confirmar liberação admin
async function confirmarLiberacaoAdmin(id, modalContainer, modalId) {
    try {
        await concluirLiberacaoQuantidade(id, 'Liberado pelo administrador para edição');
        await atualizarTelaAposLiberacao();

        const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
        if (modal) modal.hide();

        mostrarMensagemFormulario('Solicitação liberada para edição', 'success');

    } catch (error) {
        console.error('Erro ao liberar:', error);
        mostrarMensagemFormulario('Erro ao liberar solicitação', 'danger');
    }
}

// FUNÇÃO: Confirmar liberação
async function confirmarLiberacao(id, modalContainer, modalId) {
    try {
        await concluirLiberacaoQuantidade(id, 'Liberado pelo administrador para edição');
        await atualizarTelaAposLiberacao();

        const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
        if (modal) modal.hide();

        mostrarMensagemFormulario('Solicitação liberada para edição', 'success');

    } catch (error) {
        console.error('Erro ao liberar:', error);
        mostrarMensagemFormulario('Erro ao liberar solicitação', 'danger');
    }
}

// FUNÇÃO: Exportar CSV
async function exportarCSV() {
    try {
        const paraExportar = solicitacoesCache.filter(s =>
            !s.Status_Inicial || s.Status_Inicial === 4 || s.Status_Inicial === 5
        );

        if (paraExportar.length === 0) {
            alert('Nenhuma solicitação para exportar.');
            return;
        }

        if (!confirm(`Exportar ${paraExportar.length} solicitações?\n\nApós exportar, as solicitações serão bloqueadas para edição.`)) {
            return;
        }

        const dadosCSV = paraExportar.map(s => ({
            // ID: (s.id || '').replaceAll('/', ''),
            ID_Firebase: s.ID_Firebase || s.id,
            Data: new Date(s.data).toLocaleDateString('pt-BR'),
            OPM_Codigo: s.opm_codigo,
            OPM_Nome: s.opm_nome,
            Composicao_Cod: s.composicao_cod,
            Composicao_Nome: s.composicao_nome,
            Descricao: s.descricao || '',
            Horario_Inicial: s.horario_inicial,
            Horario_Final: s.horario_final,
            Solic_Superior: s.solic_superior || 0,
            Solic_Intermed: s.solic_intermed || 0,
            Solic_Subalterno: s.solic_subalterno || 0,
            Solic_Subten_Sgt: s.solic_subten_sgt,
            Solic_Cb_Sd: s.solic_cb_sd,
            Necessidade: s.necessidade ?? '',
            Motivo: s.motivo || '',
            Observacoes: s.observacoes || '',
            Status_Inicial: s.Status_Inicial || ''
        }));

        const ws = XLSX.utils.json_to_sheet(dadosCSV);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Solicitações");

        const mesStr = mesFiltro.toString().padStart(2, '0');
        const nomeArquivo = `solicitacoes_${opmSelecionada}_${anoFiltro}${mesStr}.csv`;

        XLSX.writeFile(wb, nomeArquivo);

        for (const solicitacao of paraExportar) {
            const solicitacaoRef = ref(database, `solicitacoes/${solicitacao.id}`);
            await update(solicitacaoRef, {
                Status_Inicial: 2
            });

            const historicoRef = ref(database, `solicitacoes/${solicitacao.id}/historico`);
            const entradaHistorico = criarEntradaHistorico({
                exportado_por_re: userRE,
                exportado_por_nome: userDataCache.nome
            });
            await update(historicoRef, entradaHistorico);
        }

        await carregarSolicitacoesMes();
        atualizarTabelaSolicitacoes();

        mostrarMensagemFormulario(`${paraExportar.length} solicitações exportadas e bloqueadas para edição`, 'success');

    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        mostrarMensagemFormulario('❌ Erro ao exportar CSV', 'danger');
    }
}

// FUNÇÃO: Setup notificações
export async function carregarLiberacoesPendentes() {
    const lista = document.getElementById('lista-liberacoes');
    const badge = document.getElementById('badge-liberacoes');
    const botao = document.querySelector('#liberacoes-dropdown .sirene-liberacao');
    const nivel = Number(userDataCache?.nivel || sessionStorage.getItem('userLevel') || 0);
    if (!lista || nivel !== 1) return;

    try {
        const snapshot = await get(ref(database, 'SolicLiberacaoPendentes'));
        const agrupadoPorOpm = snapshot.val() || {};
        const pedidos = [];

        Object.values(agrupadoPorOpm).forEach((porMes) => {
            Object.values(porMes || {}).forEach((itens) => {
                Object.values(itens || {}).forEach((pedido) => {
                    if (pedido?.id_firebase) pedidos.push(pedido);
                });
            });
        });

        pedidos.sort((a, b) => String(a.solicitado_em || '').localeCompare(String(b.solicitado_em || '')));
        if (badge) badge.textContent = pedidos.length > 99 ? '99+' : String(pedidos.length);
        if (botao) botao.classList.toggle('ativa', pedidos.length > 0);

        if (pedidos.length === 0) {
            lista.innerHTML = '<div class="text-center py-4 text-muted small">Nenhuma solicitação pendente</div>';
            return;
        }

        lista.innerHTML = pedidos.map((pedido) => {
            const data = obterDataSolicitacaoTabela(pedido);
            const dataFormatada = data ? data.toLocaleDateString('pt-BR') : '-';
            return `
                <button type="button" class="dropdown-item liberacao-item border-bottom py-2"
                    data-id="${escaparHTML(pedido.id_firebase)}" data-opm="${escaparHTML(pedido.opm_codigo || '')}">
                    <div class="fw-semibold small">${escaparHTML(pedido.composicao_cod || '')} - ${escaparHTML(pedido.composicao_nome || '')}</div>
                    <div class="small text-muted">${dataFormatada} | ${escaparHTML(pedido.opm_nome || pedido.opm_codigo || '')}</div>
                    <div class="small text-danger">Solicitado por: ${escaparHTML(pedido.solicitado_por_nome || pedido.solicitado_por_re || '-')}</div>
                </button>
            `;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar solicitações de liberação:', error);
        lista.innerHTML = '<div class="text-center py-4 text-danger small">Erro ao carregar solicitações</div>';
    }
}

export function setupSireneLiberacoes() {
    const dropdown = document.getElementById('liberacoes-dropdown');
    if (!dropdown) return;

    const nivel = Number(userDataCache?.nivel || sessionStorage.getItem('userLevel') || 0);
    if (nivel !== 1) {
        const acoes = document.getElementById('navbarSolicitacoesTesteAcoes');
        if (acoes) {
            acoes.classList.add('d-none');
            acoes.classList.remove('d-flex');
            acoes.style.setProperty('display', 'none', 'important');
        }
        dropdown.style.setProperty('display', 'none', 'important');
        return;
    }

    const btnAtualizar = document.getElementById('btn-atualizar-liberacoes');
    if (btnAtualizar && !btnAtualizar.dataset.configurado) {
        btnAtualizar.dataset.configurado = '1';
        btnAtualizar.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await carregarLiberacoesPendentes();
        });
    }

    const lista = document.getElementById('lista-liberacoes');
    if (lista && !lista.dataset.configurado) {
        lista.dataset.configurado = '1';
        lista.addEventListener('click', async (event) => {
            const item = event.target.closest('.liberacao-item');
            if (!item) return;

            filtrosTabelaSolicitacoes.status = ['pedido_liberacao'];
            const referencia = obterAnoMesSolicitacao({
                id: item.dataset.id || ''
            });
            if (referencia && item.dataset.opm && window.aplicarFiltrosSolicitacoes) {
                window.aplicarFiltrosSolicitacoes(item.dataset.opm, referencia.mes, referencia.ano);
            } else {
                atualizarTabelaSolicitacoes();
            }
            const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
            if (toggle && typeof bootstrap !== 'undefined') {
                bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
            }
        });
    }
}

export function setupNotificacoesSolicitacoes() {
    const userLevel = sessionStorage.getItem('userLevel');
    const notificacoesDropdown = document.getElementById('notificacoes-dropdown');

    if (userLevel !== '1' || !notificacoesDropdown) {
        if (notificacoesDropdown) notificacoesDropdown.style.display = 'none';
        const acoes = document.getElementById('navbarSolicitacoesTesteAcoes');
        if (acoes) {
            acoes.classList.add('d-none');
            acoes.classList.remove('d-flex');
            acoes.style.setProperty('display', 'none', 'important');
        }
        return;
    }

    notificacoesDropdown.style.display = 'block';

    if (notificacoesDropdown.dataset.configurado) return;
    notificacoesDropdown.dataset.configurado = '1';

    document.addEventListener('click', async (e) => {
        const btnAtualizar = e.target.closest('#btn-atualizar-notificacoes');
        if (!btnAtualizar) return;

        e.preventDefault();
        e.stopPropagation();

        const originalHTML = btnAtualizar.innerHTML;
        btnAtualizar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        btnAtualizar.disabled = true;

        const dropdownToggle = notificacoesDropdown.querySelector('[data-bs-toggle="dropdown"]');
        if (dropdownToggle && typeof bootstrap !== 'undefined') {
            const dropdown = bootstrap.Dropdown.getOrCreateInstance(dropdownToggle);
            dropdown.show();
        }

        if (window.carregarNotificacoesAdmin) {
            await window.carregarNotificacoesAdmin();
        }

        btnAtualizar.innerHTML = originalHTML;
        btnAtualizar.disabled = false;
    });

    document.addEventListener('click', (e) => {
        const item = e.target.closest('.notificacao-item');
        if (!item) return;

        e.preventDefault();
        e.stopPropagation();

        const opmCodigo = item.dataset.opm;
        const ano = item.dataset.ano;
        const mes = item.dataset.mes;

        if (!opmCodigo) return;

        if (typeof bootstrap !== 'undefined') {
            const dropdownToggle = notificacoesDropdown.querySelector('[data-bs-toggle="dropdown"]');
            if (dropdownToggle) {
                const dropdown = bootstrap.Dropdown.getInstance(dropdownToggle);
                if (dropdown) dropdown.hide();
            }
        }

        if (window.aplicarFiltrosSolicitacoes) {
            // As notificações representam solicitações aguardando processamento ou em edição.
            filtrosTabelaSolicitacoes.status = ['sem_status', '4'];
            window.aplicarFiltrosSolicitacoes(opmCodigo, mes, ano);
        } else {
            const selectOpm = document.getElementById('selectOpm');
            if (selectOpm) {
                selectOpm.value = opmCodigo;
                selectOpm.dispatchEvent(new Event('change'));
            }

            if (ano && mes) {
                const selectAno = document.getElementById('selectAno');
                const selectMes = document.getElementById('selectMes');
                if (selectAno) selectAno.value = ano;
                if (selectMes) selectMes.value = mes;
            }
            filtrosTabelaSolicitacoes.status = ['sem_status', '4'];
            atualizarTabelaSolicitacoes();
        }

    });

    const badge = document.getElementById('badge-notificacoes');
    if (badge) {
        badge.textContent = '0';
        badge.classList.remove('bg-danger');
        badge.classList.add('bg-secondary');
    }
}

// FUNÇÃO: Mostrar erro
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

// ✅ FUNÇÕES GLOBAIS
window.aplicarFiltroOPM = function(opmCodigo) {
    console.log('🎯 aplicarFiltroOPM chamado com:', opmCodigo);

    if (!opmCodigo) return;

    const tentarAplicarFiltro = () => {
        const selectOpm = document.getElementById('selectOpm');
        if (!selectOpm) return false;

        selectOpm.value = opmCodigo;
        const changeEvent = new Event('change', { bubbles: true });
        selectOpm.dispatchEvent(changeEvent);
        opmSelecionada = opmCodigo;

        return true;
    };

    if (tentarAplicarFiltro()) {
        console.log('✅ Filtro aplicado imediatamente');
        return;
    }

    let tentativas = 0;
    const maxTentativas = 10;
    const intervalo = setInterval(() => {
        tentativas++;

        if (tentarAplicarFiltro()) {
            console.log(`✅ Filtro aplicado após ${tentativas} tentativa(s)`);
            clearInterval(intervalo);
        } else if (tentativas >= maxTentativas) {
            console.warn(`Não foi possível aplicar filtro após ${maxTentativas} tentativas`);
            clearInterval(intervalo);
        }
    }, 500);
};

window.aplicarFiltrosSolicitacoes = function(opm, mes, ano) {
    console.log('🎯 Aplicando filtros:', { opm, mes, ano });

    if (!document.getElementById('solicitacoes-content') && window.app?.loadPage) {
        sessionStorage.setItem('filtroSolicitacoesTeste', JSON.stringify({
            opm: opm || '',
            mes: mes || '',
            ano: ano || '',
            status: filtrosTabelaSolicitacoes.status || []
        }));
        window.app.loadPage('solicitacoes.html');
        return;
    }

    if (opm) opmSelecionada = opm;
    if (mes) mesFiltro = parseInt(mes);
    if (ano) anoFiltro = parseInt(ano);

    const selectOpm = document.getElementById('selectOpm');
    const selectMes = document.getElementById('selectMes');
    const selectAno = document.getElementById('selectAno');

    if (selectOpm && opm) selectOpm.value = opm;
    if (selectMes && mes) selectMes.value = mes;
    if (selectAno && ano) selectAno.value = ano;

    if (opmSelecionada) {
        carregarSolicitacoesMes().then(() => {
            atualizarTabelaSolicitacoes();
            if (selectOpm) atualizarComposicoesDropdown();
        });
    }
};

window.buscarEscaladosModal = buscarEscaladosModal;
window.carregarNotificacoesAdmin = carregarNotificacoesAdmin;
window.atualizarBadgeNotificacoes = function(numero) {
    const badge = document.getElementById('badge-notificacoes');
    if (!badge) return;

    if (numero > 0) {
        badge.textContent = numero > 99 ? '99+' : numero.toString();
        badge.classList.remove('bg-secondary');
        badge.classList.add('bg-danger');
    } else {
        badge.textContent = '0';
        badge.classList.remove('bg-danger');
        badge.classList.add('bg-secondary');
    }
};

// Estilos adicionais
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(255, 193, 7, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); }
    }

    .pulse-animation {
        animation: pulse 2s infinite;
    }

    .notificacao-item:hover {
        background-color: rgba(255, 193, 7, 0.1) !important;
        cursor: pointer;
    }

    #notificacoes-dropdown .dropdown-menu {
        border: 1px solid #ffc107;
    }

    @keyframes piscarSireneLiberacao {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.55); }
        50% { opacity: 0.45; box-shadow: 0 0 0 8px rgba(220, 53, 69, 0); }
    }

    .sirene-liberacao.ativa {
        animation: piscarSireneLiberacao 1.1s infinite;
    }

    #liberacoes-dropdown .dropdown-menu {
        border: 1px solid #dc3545;
    }

    .liberacao-item:hover {
        background-color: rgba(220, 53, 69, 0.08) !important;
    }

    .quantidade-autorizada {
        color: #0d6efd;
    }

    .excluir-pendencia {
        transition: all 0.2s;
    }

    .excluir-pendencia:hover {
        background-color: #dc3545 !important;
        color: white !important;
        border-color: #dc3545 !important;
    }
`;
document.head.appendChild(style);

// Se carregando como página normal
if (!window.location.pathname.includes('app.html') && !document.getElementById('app-content')) {
    document.addEventListener('DOMContentLoaded', async function() {
        try {
            const { loadNavbar } = await import('./auth-check.js');
            await loadNavbar();
        } catch (e) {
            console.warn('Não foi possível carregar navbar:', e);
        }
        await initSolicitacoes();
    });
}

export default initSolicitacoes;
