import { database } from './firebase-config.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getDatabase, ref, set, onValue, get } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

const CONFIG_URL_GBLAUREAS = 'https://gblaureas-default-rtdb.firebaseio.com/firebase-config.json';

const CONFIG_SGB = {
    'moderadores2sgb': {
        titulo: '2º SGB',
        no: 'Solic_Moderador_2SGB',
        opms: [
            ['2º SGB - Comando', '704092000'], ['1ª EB Cidade Nova', '704092101'],
            ['2ª EB Orlândia', '704092102'], ['2º PB Distrito Industrial', '704092200'],
            ['1ª EB Distrito Industrial', '704092201'], ['2ª EB Ituverava', '704092202'],
            ['1ª EB Barretos', '704092301'], ['4º PB Olímpia', '704092400'],
            ['1ª EB Olímpia', '704092401'], ['Bcom Severínia', '704092402']
        ]
    },
    'moderadores3sgb': {
        titulo: '3º SGB',
        no: 'Solic_Moderador_3SGB',
        opms: [
            ['3º SGB - Comando', '704093000'], ['3º SGB - Administração', '704093800'],
            ['1ª EB Jardim Primavera', '704093101'], ['2ª EB Vila Xavier', '704093102'],
            ['3ª EB Matão', '704093103'], ['2º PB Ibitinga', '704093200'],
            ['1º EB Ibitinga', '704093201'], ['2ª EB Taquaritinga', '704093202'],
            ['3ª EB Itápolis', '704093203']
        ]
    },
    'moderadores4sgb': {
        titulo: '4º SGB',
        no: 'Solic_Moderador_4SGB',
        opms: [
            ['4º SGB - Comando', '704094000'], ['4º SGB - Nuc Ativ Tec', '704094900'],
            ['1ª EB Vila São Gabriel', '704094101'], ['2ª EB Centro', '704094102'],
            ['1ª EB Porto Ferreira', '704094201']
        ]
    }
};

const chavePagina = String(location.pathname.split('/').pop() || '')
    .replace(/\.html$/i, '').toLowerCase();
const CONFIG_ATUAL = CONFIG_SGB[chavePagina];
if (!CONFIG_ATUAL) throw new Error('Página de moderadores SGB não reconhecida.');
const OPM_OPTIONS = CONFIG_ATUAL.opms.map(([texto, codigo]) => ({ texto, codigo }));

const POST_GRAD_OPTIONS = [
    'CEL PM',
    'TEN CEL PM',
    'MAJ PM',
    'CAP PM',
    '1. TEN PM',
    '2. TEN PM',
    'SUBTEN PM',
    '1. SGT PM',
    '2. SGT PM',
    '3. SGT PM',
    'CB PM',
    'SD PM'
];

const OPM_COLORS = [
    '#1f4e79',
    '#4472c4',
    '#70ad47',
    '#548235',
    '#a64d79',
    '#843c0c',
    '#c55a11',
    '#bf9000',
    '#7030a0',
    '#00a2e8',
    '#375623',
    '#7f6000',
    '#5b9bd5',
    '#c00000'
];

const form = document.getElementById('formModerador');
const inputRE = document.getElementById('inputRE');
const inputDC = document.getElementById('inputDC');
const inputNome = document.getElementById('inputNomeCompleto');
const selectOPM = document.getElementById('selectOPM');
const selectPostGrad = document.getElementById('selectPostGrad');
const inputEmail = document.getElementById('inputEmail');
const inputCPF = document.getElementById('inputCPF');
const inputWhatsApp = document.getElementById('inputWhatsApp');
const tbody = document.getElementById('tbodyModeradores');
const contador = document.getElementById('contadorModeradores');
const mensagem = document.getElementById('mensagemModerador');
const btnSalvar = document.getElementById('btnSalvarModerador');
let geralDatabase = null;
let ultimoREConsultado = '';
let moderadoresCache = {};
let reEmEdicao = '';

document.addEventListener('DOMContentLoaded', () => {
    preencherSelects();
    configurarMascaras();
    carregarModeradores();

    form.addEventListener('submit', salvarModerador);
    form.addEventListener('reset', () => {
        setTimeout(() => {
            ultimoREConsultado = '';
            reEmEdicao = '';
            inputRE.disabled = false;
            setCamposFirebaseBloqueados(false);
            btnSalvar.innerHTML = '<i class="fas fa-plus me-1"></i>Adicionar moderador';
        }, 0);
    });
    tbody.addEventListener('click', tratarCliqueTabela);
});

function preencherSelects() {
    OPM_OPTIONS.forEach(opm => {
        const option = document.createElement('option');
        option.value = opm.codigo;
        option.textContent = opm.texto;
        selectOPM.appendChild(option);
    });

    POST_GRAD_OPTIONS.forEach(postGrad => {
        const option = document.createElement('option');
        option.value = postGrad;
        option.textContent = postGrad;
        selectPostGrad.appendChild(option);
    });
}

function configurarMascaras() {
    inputRE.addEventListener('input', async () => {
        inputRE.value = somenteNumeros(inputRE.value).slice(0, 6);
        if (inputRE.value.length === 6) {
            await preencherDadosPorRE(inputRE.value);
        } else {
            ultimoREConsultado = '';
            setCamposFirebaseBloqueados(false);
        }
    });

    inputDC.addEventListener('input', () => {
        inputDC.value = inputDC.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase();
    });

    inputNome.addEventListener('blur', () => {
        inputNome.value = inputNome.value.trimEnd().toUpperCase();
    });

    inputCPF.addEventListener('input', () => {
        inputCPF.value = mascararCPF(somenteNumeros(inputCPF.value).slice(0, 11));
    });

    inputWhatsApp.addEventListener('input', () => {
        inputWhatsApp.value = mascararWhatsApp(somenteNumeros(inputWhatsApp.value).slice(0, 11));
    });
}

async function preencherDadosPorRE(re) {
    if (re === ultimoREConsultado) return;
    ultimoREConsultado = re;

    try {
        inputRE.classList.add('is-valid');
        setCamposFirebaseBloqueados(false);

        const dbGeral = await obterGeralDatabase();
        const [efetivoSnap, permissaoSnap] = await Promise.all([
            get(ref(dbGeral, `efetivo9gb/${re}`)),
            get(ref(dbGeral, `permissao_login/${re}`))
        ]);

        const efetivo = efetivoSnap.exists() ? efetivoSnap.val() : {};
        const permissao = permissaoSnap.exists() ? permissaoSnap.val() : {};

        if (!efetivoSnap.exists() && !permissaoSnap.exists()) {
            exibirMensagem('RE não localizado no Firebase geral. Preencha os dados manualmente.', 'warning');
            return;
        }

        const dc = primeiroValor(efetivo.dc, efetivo.DC, permissao.dc, permissao.DC);
        const nome = primeiroValor(permissao.nome_completo, permissao.nome, efetivo.nome_completo, efetivo.nome);
        const postGrad = primeiroValor(efetivo.post_grad, efetivo.posto_grad, permissao.post_grad, permissao.posto_grad);
        const mailFuncional = primeiroValor(permissao.mail_funcional, efetivo.mail_funcional, permissao.email, efetivo.email);

        if (dc) inputDC.value = String(dc).trim().slice(0, 1).toUpperCase();
        if (nome) inputNome.value = String(nome).trimEnd().toUpperCase();
        if (postGrad) selecionarPostGrad(String(postGrad).trim().toUpperCase());
        if (mailFuncional) inputEmail.value = String(mailFuncional).trim().toLowerCase();
        setCamposFirebaseBloqueados(true);
        inputCPF.focus();

        exibirMensagem('Dados localizados no Firebase geral e preenchidos automaticamente.', 'success');
    } catch (error) {
        console.error('Erro ao buscar dados do RE:', error);
        exibirMensagem('Não foi possível buscar os dados no Firebase geral. Preencha manualmente.', 'warning');
    } finally {
        inputRE.classList.remove('is-valid');
    }
}


function setCamposFirebaseBloqueados(bloquear) {
    [inputDC, inputNome, inputEmail].forEach(campo => {
        campo.readOnly = bloquear;
        campo.classList.toggle('bg-light', bloquear);
    });

    selectPostGrad.disabled = bloquear;
    selectPostGrad.classList.toggle('bg-light', bloquear);
}

async function obterGeralDatabase() {
    if (geralDatabase) return geralDatabase;

    const response = await fetch(CONFIG_URL_GBLAUREAS);
    if (!response.ok) {
        throw new Error(`Erro ao carregar configuração geral: HTTP ${response.status}`);
    }

    const config = await response.json();
    if (!config?.geralConfig) {
        throw new Error('Configuração geral não encontrada.');
    }

    const app = getApps().find(item => item.name === 'geral9gb') || initializeApp(config.geralConfig, 'geral9gb');
    geralDatabase = getDatabase(app);
    return geralDatabase;
}

function primeiroValor(...valores) {
    return valores.find(valor => String(valor || '').trim() !== '') || '';
}

function selecionarPostGrad(valor) {
    const normalizado = normalizarTexto(valor);
    const option = [...selectPostGrad.options].find(item => normalizarTexto(item.value) === normalizado);
    if (option) selectPostGrad.value = option.value;
}

async function salvarModerador(event) {
    event.preventDefault();

    const re = somenteNumeros(inputRE.value);
    const dc = inputDC.value.trim().toUpperCase();
    const nomeCompleto = inputNome.value.trimEnd().toUpperCase();
    const opm = selectOPM.value;
    const postGrad = selectPostGrad.value;
    const mailFuncional = inputEmail.value.trim();
    const cpf = somenteNumeros(inputCPF.value);
    const whastapp = somenteNumeros(inputWhatsApp.value);

    const erro = validarDados({ re, dc, nomeCompleto, opm, postGrad, mailFuncional, cpf, whastapp });
    if (erro) {
        exibirMensagem(erro, 'danger');
        return;
    }

    if (!reEmEdicao && moderadoresCache[re]) {
        exibirMensagem('Este RE já está cadastrado. Use o botão de edição na tabela para alterar os dados.', 'warning');
        return;
    }

    if (reEmEdicao && reEmEdicao !== re) {
        exibirMensagem('Não é permitido alterar o RE durante a edição.', 'warning');
        return;
    }

    const dados = {
        re: Number(re),
        dc,
        nome_completo: nomeCompleto,
        opm,
        post_grad: postGrad,
        mail_funcional: mailFuncional,
        cpf,
        whastapp
    };

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando';

        await set(ref(database, `${CONFIG_ATUAL.no}/${re}`), dados);

        form.reset();
        exibirMensagem(reEmEdicao ? 'Moderador atualizado com sucesso.' : 'Moderador adicionado com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao salvar moderador:', error);
        exibirMensagem('Erro ao salvar. Verifique a conexão e tente novamente.', 'danger');
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<i class="fas fa-plus me-1"></i>Adicionar moderador';
    }
}

function validarDados(dados) {
    if (!/^\d{6}$/.test(dados.re)) return 'O RE deve conter exatamente 6 dígitos.';
    if (!/^[A-Z0-9]$/.test(dados.dc)) return 'O DC deve conter apenas 1 número ou letra.';
    if (!dados.nomeCompleto.trim()) return 'Informe o nome completo.';
    if (!dados.opm || !/^\d{9}$/.test(dados.opm)) return 'Selecione uma OPM válida.';
    if (!dados.postGrad) return 'Selecione o posto/graduação.';
    if (!dados.mailFuncional) return 'Informe o e-mail.';
    if (!/^\d{11}$/.test(dados.cpf)) return 'O CPF deve conter 11 números.';
    if (!/^\d{10,11}$/.test(dados.whastapp)) return 'O WhatsApp deve conter DDD + telefone com 8 ou 9 dígitos.';
    return '';
}

function carregarModeradores() {
    onValue(ref(database, CONFIG_ATUAL.no), snapshot => {
        const dados = snapshot.val() || {};
        moderadoresCache = dados;
        const lista = Object.entries(dados).map(([id, item]) => ({
            id,
            ...item
        }));

        lista.sort((a, b) => {
            const idxA = indiceOPM(a.opm);
            const idxB = indiceOPM(b.opm);
            if (idxA !== idxB) return idxA - idxB;
            return String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR');
        });

        renderizarTabela(lista);
    }, error => {
        console.error('Erro ao carregar moderadores:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-danger">
                    Erro ao carregar moderadores.
                </td>
            </tr>
        `;
    });
}

function renderizarTabela(lista) {
    contador.textContent = lista.length;

    if (!lista.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-4 text-muted">
                    Nenhum moderador cadastrado.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lista.map(item => {
        const opmInfo = obterOPM(item.opm);
        const cor = OPM_COLORS[indiceOPM(item.opm) % OPM_COLORS.length];

        return `
            <tr>
                <td class="fw-bold">${escaparHTML(String(item.re || ''))}</td>
                <td>${escaparHTML(item.dc || '')}</td>
                <td>${escaparHTML(item.nome_completo || '')}</td>
                <td>
                    <span class="opm-chip" style="background:${cor}">
                        ${escaparHTML(opmInfo?.texto || item.opm || '')}
                    </span>
                </td>
                <td>${escaparHTML(item.post_grad || '')}</td>
                <td>${escaparHTML(item.mail_funcional || '')}</td>
                <td>${mascararCPF(String(item.cpf || ''))}</td>
                <td>${mascararWhatsApp(String(item.whastapp || ''))}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-outline-primary btn-editar-moderador" data-re="${escaparHTML(String(item.id || item.re || ''))}" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function tratarCliqueTabela(event) {
    const botao = event.target.closest('.btn-editar-moderador');
    if (!botao) return;

    const re = botao.dataset.re;
    const item = moderadoresCache[re];
    if (!item) {
        exibirMensagem('Não foi possível localizar este moderador para edição.', 'danger');
        return;
    }

    carregarModeradorParaEdicao(re, item);
}

function carregarModeradorParaEdicao(re, item) {
    reEmEdicao = String(re);
    ultimoREConsultado = String(re);

    inputRE.value = String(item.re || re).padStart(6, '0');
    inputRE.disabled = true;
    inputDC.value = String(item.dc || '').trim().slice(0, 1).toUpperCase();
    inputNome.value = String(item.nome_completo || '').trimEnd().toUpperCase();
    selectOPM.value = String(item.opm || '');
    selecionarPostGrad(String(item.post_grad || '').trim().toUpperCase());
    inputEmail.value = String(item.mail_funcional || '').trim();
    inputCPF.value = mascararCPF(String(item.cpf || ''));
    inputWhatsApp.value = mascararWhatsApp(String(item.whastapp || ''));

    setCamposFirebaseBloqueados(false);
    inputCPF.focus();
    btnSalvar.innerHTML = '<i class="fas fa-save me-1"></i>Salvar edição';
    exibirMensagem('Edição carregada. Ajuste os dados e salve.', 'info');
}

function obterOPM(codigo) {
    return OPM_OPTIONS.find(opm => opm.codigo === String(codigo));
}

function indiceOPM(codigo) {
    const idx = OPM_OPTIONS.findIndex(opm => opm.codigo === String(codigo));
    return idx === -1 ? 999 : idx;
}

function somenteNumeros(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function mascararCPF(valor) {
    const numeros = somenteNumeros(valor).slice(0, 11);
    return numeros
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

function mascararWhatsApp(valor) {
    const numeros = somenteNumeros(valor).slice(0, 11);

    if (numeros.length <= 2) return numeros;
    if (numeros.length <= 10) {
        return numeros
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/^(\(\d{2}\) \d{4})(\d)/, '$1-$2');
    }

    return numeros
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^(\(\d{2}\) \d{5})(\d)/, '$1-$2');
}

function exibirMensagem(texto, tipo) {
    mensagem.innerHTML = `
        <div class="alert alert-${tipo} py-2 mb-0">
            ${escaparHTML(texto)}
        </div>
    `;

    setTimeout(() => {
        mensagem.innerHTML = '';
    }, 4000);
}

function escaparHTML(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
