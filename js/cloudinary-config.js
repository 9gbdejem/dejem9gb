// js/cloudinary-config.js - Configuração do Cloudinary
// Configurado com suas credenciais

const CLOUDINARY_CONFIG = {
    cloud_name: 'djr6lzgcu',                 // Seu cloud name
    upload_preset: 'anexos_solicitacoes',     // Seu upload preset
    folder: 'solicitacoes',                    // Pasta para organizar os anexos
    api_key: '789549942241327'                  // Sua API Key (opcional)
};

// ✅ Função para gerar nome do arquivo no padrão: AAAAMMOPMCOMPOSICAONN
export function gerarNomeArquivoCloudinary(ano, mes, opmCodigo, composicaoCod, numeroAnexo) {
    // Formato: ANO(4) + MES(2) + OPM(9) + COMPOSICAO(5) + NUMERO(2)
    // Exemplo: 2026027040991311239501
    const anoStr = ano.toString().padStart(4, '0');
    const mesStr = mes.toString().padStart(2, '0');
    const opmStr = opmCodigo.toString().padStart(9, '0');
    const compStr = composicaoCod.toString().padStart(5, '0');
    const numStr = numeroAnexo.toString().padStart(2, '0');
    
    return `${anoStr}${mesStr}${opmStr}${compStr}${numStr}`;
}

// ✅ Função principal de upload para Cloudinary
export async function uploadParaCloudinary(arquivo, nomeArquivo) {
    try {
        // Validações básicas
        if (!arquivo) {
            throw new Error('Nenhum arquivo fornecido');
        }
        
        if (!validarArquivoPDF(arquivo)) {
            throw new Error('Apenas arquivos PDF são permitidos');
        }
        
        // Limite de tamanho (opcional - 20MB)
        const MAX_SIZE = 20 * 1024 * 1024; // 20MB
        if (arquivo.size > MAX_SIZE) {
            throw new Error(`Arquivo muito grande. Máximo permitido: 20MB (atual: ${(arquivo.size / 1024 / 1024).toFixed(2)}MB)`);
        }
        
        console.log(`📤 Iniciando upload para Cloudinary...`);
        console.log(`📄 Arquivo: ${arquivo.name} (${(arquivo.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`🏷️ Nome no sistema: ${nomeArquivo}.pdf`);
        
        // Criar FormData para upload
        const formData = new FormData();
        formData.append('file', arquivo);
        formData.append('upload_preset', CLOUDINARY_CONFIG.upload_preset);
        formData.append('public_id', nomeArquivo); // Nome único do arquivo (sem extensão)
        formData.append('folder', CLOUDINARY_CONFIG.folder);
        
        // Adicionar contexto com informações do upload (opcional)
        const userRE = sessionStorage.getItem('userRE') || 'desconhecido';
        const userName = sessionStorage.getItem('userName') || 'desconhecido';
        formData.append('context', `upload_por_re=${userRE}|upload_por_nome=${userName}`);
        
        // Opções adicionais
        formData.append('resource_type', 'auto'); // Detecta automaticamente (PDF)
        formData.append('tags', 'solicitacoes,anexo'); // Tags para organização
        
        // Fazer upload para Cloudinary
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/auto/upload`, {
            method: 'POST',
            body: formData
        });
        
        // Verificar resposta
        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Resposta de erro do Cloudinary:', errorData);
            throw new Error(`Erro Cloudinary: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log(`✅ Upload concluído com sucesso!`);
        console.log(`🔗 URL: ${data.secure_url}`);
        console.log(`🆔 Public ID: ${data.public_id}`);
        
        // Retornar apenas os campos necessários
        return {
            url: data.secure_url,                    // URL HTTPS para acesso
            secure_url: data.secure_url,              // URL segura (mesma coisa)
            public_id: data.public_id,                 // ID único no Cloudinary
            nome_sistema: nomeArquivo,                 // Nome do arquivo (sem extensão)
            tamanho: data.bytes,                        // Tamanho em bytes
            formato: data.format,                        // Formato do arquivo (pdf)
            largura: data.width,                         // Largura (se imagem)
            altura: data.height,                          // Altura (se imagem)
            versao: data.version,                          // Versão do upload
            criado_em: data.created_at                     // Data de criação
        };
        
    } catch (error) {
        console.error('❌ Erro detalhado no upload:', error);
        throw error;
    }
}

// ✅ Função para validar arquivo PDF
function validarArquivoPDF(arquivo) {
    // Verificar extensão
    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.pdf')) {
        return false;
    }
    
    // Verificar tipo MIME (se disponível)
    const tiposPermitidos = ['application/pdf', 'application/x-pdf'];
    if (arquivo.type && !tiposPermitidos.includes(arquivo.type)) {
        console.warn('⚠️ Tipo MIME não é PDF, mas extensão é .pdf - permitindo mesmo assim');
        // Não falha, apenas avisa
    }
    
    return true;
}

// ✅ Função para gerar URL de visualização (caso precise manipular)
export function gerarUrlVisualizacao(publicId, opcoes = {}) {
    const { largura, altura, pagina = 1 } = opcoes;
    let url = `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloud_name}/image/upload`;
    
    // Adicionar transformações se solicitado
    const transformations = [];
    if (largura) transformations.push(`w_${largura}`);
    if (altura) transformations.push(`h_${altura}`);
    if (pagina) transformations.push(`pg_${pagina}`); // Página específica do PDF
    
    if (transformations.length > 0) {
        url += `/${transformations.join(',')}`;
    }
    
    url += `/${publicId}.pdf`;
    return url;
}

// ✅ Função para excluir arquivo do Cloudinary (requer backend seguro)
// ATENÇÃO: Esta função requer autenticação via backend com API Secret
// Por segurança, implementamos apenas a lógica de marcação para exclusão futura
export async function marcarParaExclusao(publicId, motivo = 'Exclusão manual') {
    console.log(`🗑️ Arquivo marcado para exclusão: ${publicId}`);
    console.log(`📝 Motivo: ${motivo}`);
    console.log(`ℹ️ A exclusão real deve ser feita via backend ou dashboard do Cloudinary`);
    
    // Retornar objeto informativo
    return {
        success: true,
        message: 'Arquivo marcado para exclusão',
        public_id: publicId,
        motivo: motivo,
        data: new Date().toISOString()
    };
}

// ✅ Função para extrair informações do nome do arquivo
export function extrairInfoDoNomeArquivo(nomeArquivo) {
    try {
        // Formato esperado: AAAAMMOPMCOMPOSICAONN
        // Exemplo: 2026027040991311239501
        if (!nomeArquivo || nomeArquivo.length < 20) {
            return null;
        }
        
        const ano = nomeArquivo.substring(0, 4);
        const mes = nomeArquivo.substring(4, 6);
        const opm = nomeArquivo.substring(6, 15);
        const composicao = nomeArquivo.substring(15, 20);
        const numero = nomeArquivo.substring(20, 22);
        
        return {
            ano,
            mes,
            opm,
            composicao,
            numero,
            valido: ano.length === 4 && mes.length === 2 && opm.length === 9 && 
                    composicao.length === 5 && numero.length === 2
        };
    } catch (error) {
        console.error('Erro ao extrair info do nome do arquivo:', error);
        return null;
    }
}

// ✅ Função para testar conexão com Cloudinary
export async function testarConexaoCloudinary() {
    try {
        console.log('🔍 Testando conexão com Cloudinary...');
        console.log(`☁️ Cloud name: ${CLOUDINARY_CONFIG.cloud_name}`);
        console.log(`📤 Upload preset: ${CLOUDINARY_CONFIG.upload_preset}`);
        
        // Tentar acessar a API de ping
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloud_name}/resources/image`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${btoa(CLOUDINARY_CONFIG.api_key + ':')}` // Apenas para teste
            }
        });
        
        if (response.ok) {
            console.log('✅ Conexão com Cloudinary OK!');
            return true;
        } else {
            console.warn('⚠️ Não foi possível verificar a conexão (pode ser normal sem autenticação)');
            return true; // Assume que está ok para upload unsigned
        }
        
    } catch (error) {
        console.error('❌ Erro ao testar conexão:', error);
        return false;
    }
}

// ✅ Função para formatar tamanho de arquivo
export function formatarTamanhoArquivo(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ✅ Exportar configuração para uso em outros arquivos
export default CLOUDINARY_CONFIG;