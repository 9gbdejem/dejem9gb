// auth.js
import { 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { auth, database } from "./firebase-config.js";

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loading = document.getElementById('loading');
    
    errorMessage.textContent = '';
    successMessage.textContent = '';
    loading.style.display = 'block';
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Verifica se é primeiro acesso
        const userSnapshot = await get(ref(database, `usuarios/${user.uid}`));
        
        if (userSnapshot.exists() && userSnapshot.val().redefinirSenha) {
            window.location.href = 'redefinir-senha.html';
        } else {
            window.location.href = 'main.html';
        }
        
    } catch (error) {
        loading.style.display = 'none';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage.textContent = 'Usuário não encontrado.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage.textContent = 'Senha incorreta.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage.textContent = 'E-mail inválido.';
        } else {
            errorMessage.textContent = 'Erro ao fazer login. Tente novamente.';
        }
    }
});

// Esqueci minha senha
document.getElementById('forgotPassword').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    if (!email) {
        errorMessage.textContent = 'Digite seu e-mail primeiro.';
        return;
    }
    
    try {
        await sendPasswordResetEmail(auth, email);
        successMessage.textContent = 'E-mail de redefinição enviado! Verifique sua caixa de entrada.';
    } catch (error) {
        errorMessage.textContent = 'Erro ao enviar e-mail de redefinição.';
    }
});

// Verifica se usuário já está logado
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userSnapshot = await get(ref(database, `usuarios/${user.uid}`));
        
        if (userSnapshot.exists() && userSnapshot.val().redefinirSenha) {
            window.location.href = 'redefinir-senha.html';
        } else {
            window.location.href = 'main.html';
        }
    }
});