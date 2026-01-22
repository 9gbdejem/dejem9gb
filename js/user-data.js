// js/user-data.js - Gerenciador Central de Dados do Usuário
const UserData = {
    // Armazenar dados em memória
    data: {
        userRE: null,
        userName: null
    },
    
    // Inicializar com dados do sessionStorage
    init() {
        this.data.userRE = sessionStorage.getItem('userRE');
        this.data.userName = sessionStorage.getItem('userName');
        console.log('📦 UserData inicializado:', this.data);
    },
    
    // Atualizar dados
    update(re, name) {
        this.data.userRE = re;
        this.data.userName = name;
        
        // Salvar no sessionStorage também
        sessionStorage.setItem('userRE', re);
        sessionStorage.setItem('userName', name);
        
        console.log('🔄 UserData atualizado:', this.data);
        
        // Disparar evento
        this.emitChange();
    },
    
    // Obter dados
    get() {
        return { ...this.data };
    },
    
    // Disparar evento de mudança
    emitChange() {
        window.dispatchEvent(new CustomEvent('userDataChanged', {
            detail: this.get()
        }));
    },
    
    // Escutar mudanças
    onChanged(callback) {
        window.addEventListener('userDataChanged', (e) => callback(e.detail));
    }
};

// Inicializar automaticamente
UserData.init();

// Exportar para uso global
window.UserData = UserData;
export default UserData;