// Arquivo para funções auxiliares de confirmações (opcional)
import { database } from './firebase-config.js';
import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

export async function getConfirmacoesPorId(escalaId) {
    try {
        const confirmRef = ref(database, `confirmacoes/${escalaId}`);
        const snapshot = await get(confirmRef);
        
        if (snapshot.exists()) {
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar confirmações:', error);
        return null;
    }
}

export async function salvarConfirmacao(escalaId, userRE, dados) {
    try {
        const timestamp = Date.now();
        const confirmRef = ref(database, `confirmacoes/${escalaId}`);
        
        // Primeiro, pegar dados existentes
        const snapshot = await get(confirmRef);
        const dadosExistentes = snapshot.exists() ? snapshot.val() : {};
        
        // Atualizar dados gerais
        const novosDados = {
            ...dadosExistentes,
            dados_gerais: {
                sei_link: dados.seiLink,
                observacoes: dados.observacoes,
                ultima_atualizacao: timestamp,
                atualizado_por: userRE
            }
        };
        
        // Adicionar confirmação do usuário
        novosDados[`RE_${userRE}`] = {
            status: dados.status,
            confirmado_por: userRE,
            data_confirmacao: timestamp
        };
        
        // Salvar tudo de uma vez
        await set(confirmRef, novosDados);
        
        return { success: true, timestamp };
        
    } catch (error) {
        console.error('Erro ao salvar confirmação:', error);
        return { success: false, error };
    }
}

export async function deletarConfirmacao(escalaId, userRE) {
    try {
        await remove(ref(database, `confirmacoes/${escalaId}/RE_${userRE}`));
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar confirmação:', error);
        return { success: false, error };
    }
}

export function formatarDataConfirmacao(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}