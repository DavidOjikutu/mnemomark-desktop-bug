// Authentication UI handlers for desktop app (mirrors extension flow)

function setupAuthUI() {
  const authModal = document.getElementById('authModal');
  const authModalTitle = document.getElementById('authModalTitle');
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');

  // Buttons
  const closeAuthModalBtn = document.getElementById('closeAuthModal');
  const signInBtn = document.getElementById('signInBtn');
  const signUpBtn = document.getElementById('signUpBtn');
  const switchToSignUpBtn = document.getElementById('switchToSignUpBtn');
  const switchToSignInBtn = document.getElementById('switchToSignInBtn');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const sendResetEmailBtn = document.getElementById('sendResetEmailBtn');
  const backToSignInBtn = document.getElementById('backToSignInBtn');

  if (switchToSignUpBtn) {
    switchToSignUpBtn.addEventListener('click', () => {
      signInForm.style.display = 'none';
      signUpForm.style.display = 'block';
      authModalTitle.textContent = 'Create Account';
      hideError();
    });
  }

  if (switchToSignInBtn) {
    switchToSignInBtn.addEventListener('click', () => {
      signUpForm.style.display = 'none';
      signInForm.style.display = 'block';
      authModalTitle.textContent = 'Sign In';
      hideError();
    });
  }

  if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener('click', () => {
      authModal.classList.remove('show');
      hideError();
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', () => {
      signInForm.style.display = 'none';
      signUpForm.style.display = 'none';
      const forgotPasswordForm = document.getElementById('forgotPasswordForm');
      if (forgotPasswordForm) {
        forgotPasswordForm.style.display = 'block';
      }
      authModalTitle.textContent = 'Reset Password';
      hideError();
    });
  }

  if (backToSignInBtn) {
    backToSignInBtn.addEventListener('click', () => {
      const forgotPasswordForm = document.getElementById('forgotPasswordForm');
      if (forgotPasswordForm) {
        forgotPasswordForm.style.display = 'none';
      }
      signInForm.style.display = 'block';
      signUpForm.style.display = 'none';
      authModalTitle.textContent = 'Sign In';
      hideError();
    });
  }

  if (sendResetEmailBtn) {
    sendResetEmailBtn.addEventListener('click', async () => {
      const email = document.getElementById('forgotPasswordEmail').value.trim();
      if (!email) {
        showError('Please enter your email address');
        return;
      }

      sendResetEmailBtn.disabled = true;
      sendResetEmailBtn.textContent = 'Sending...';
      const result = await window.authService.sendPasswordResetEmail(email);

      if (result.success) {
        showError('Password reset email sent! Please check your inbox.', true);
        setTimeout(() => {
          const forgotPasswordForm = document.getElementById('forgotPasswordForm');
          if (forgotPasswordForm) {
            forgotPasswordForm.style.display = 'none';
          }
          signInForm.style.display = 'block';
          authModalTitle.textContent = 'Sign In';
          document.getElementById('forgotPasswordEmail').value = '';
          hideError();
        }, 3000);
      } else {
        showError(result.error || 'Failed to send reset email. Please try again.');
      }

      sendResetEmailBtn.disabled = false;
      sendResetEmailBtn.textContent = 'Send Reset Email';
    });
  }

  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      const email = document.getElementById('signInEmail').value.trim();
      const password = document.getElementById('signInPassword').value;
      if (!email || !password) {
        showError('Please enter both email and password');
        return;
      }

      signInBtn.disabled = true;
      signInBtn.textContent = 'Signing in...';
      const result = await window.authService.signIn(email, password);

      if (result.success) {
        authModal.classList.remove('show');
        updateAuthUI();
        document.getElementById('signInEmail').value = '';
        document.getElementById('signInPassword').value = '';
      } else {
        showError(result.error || 'Sign in failed. Please try again.');
      }

      signInBtn.disabled = false;
      signInBtn.textContent = 'Sign In';
    });
  }

  if (signUpBtn) {
    signUpBtn.addEventListener('click', async () => {
      const email = document.getElementById('signUpEmail').value.trim();
      const password = document.getElementById('signUpPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const shareTagsOption = document.getElementById('shareTagsCheckbox').checked;

      if (!email || !password || !confirmPassword) {
        showError('Please fill in all fields');
        return;
      }
      if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
      }

      signUpBtn.disabled = true;
      signUpBtn.textContent = 'Creating account...';
      const result = await window.authService.signUp(email, password, shareTagsOption);

      if (result.success) {
        authModal.classList.remove('show');
        updateAuthUI();
        document.getElementById('signUpEmail').value = '';
        document.getElementById('signUpPassword').value = '';
        document.getElementById('confirmPassword').value = '';
      } else {
        showError(result.error || 'Account creation failed. Please try again.');
      }

      signUpBtn.disabled = false;
      signUpBtn.textContent = 'Create Account';
    });
  }

  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target.id === 'authModal') {
        authModal.classList.remove('show');
        hideError();
      }
    });
  }

  const showSignInBtn = document.getElementById('showSignInBtn');
  if (showSignInBtn) {
    showSignInBtn.addEventListener('click', showAuthModal);
  }

  initAccountModal();
}

function showError(message, isSuccess = false) {
  const authError = document.getElementById('authError');
  if (authError) {
    authError.textContent = message;
    authError.style.display = 'block';
    if (isSuccess) {
      authError.style.backgroundColor = '#e8f5e9';
      authError.style.color = '#2e7d32';
      authError.style.borderColor = '#4CAF50';
    } else {
      authError.style.backgroundColor = '#ffebee';
      authError.style.color = '#c62828';
      authError.style.borderColor = '#ef5350';
    }
  }
}

function hideError() {
  const authError = document.getElementById('authError');
  if (authError) {
    authError.style.display = 'none';
  }
}

function showAuthModal() {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.classList.add('show');
    document.getElementById('signInForm').style.display = 'block';
    document.getElementById('signUpForm').style.display = 'none';
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
      forgotPasswordForm.style.display = 'none';
    }
    document.getElementById('authModalTitle').textContent = 'Sign In';
    hideError();
  }
}

function updateAuthUI() {
  const user = window.authService.getCurrentUser();
  const sharing = window.authService.isSharingTags();
  let userInfo = document.getElementById('userInfo');

  if (user) {
    if (!userInfo) {
      const header = document.querySelector('header');
      if (header) {
        userInfo = document.createElement('div');
        userInfo.id = 'userInfo';
        userInfo.className = 'user-info';
        header.appendChild(userInfo);
      }
    }

    const signInBtn = document.getElementById('showSignInBtn');
    if (signInBtn) {
      signInBtn.remove();
    }

    if (userInfo) {
      userInfo.innerHTML = `
        <span class="user-email">${escapeHtml(user.email)}</span>
        <span class="sync-status ${sharing ? '' : 'no-sync'}">
          ${sharing ? 'Synced' : 'Local only'}
        </span>
        <button id="editAccountBtn" class="btn btn-small btn-secondary">Edit Account</button>
      `;

      const editAccountBtn = document.getElementById('editAccountBtn');
      if (editAccountBtn) {
        editAccountBtn.addEventListener('click', () => showAccountModal(user));
      }
    }

    if (window.authService && typeof window.authService.reconcileShareTags === 'function') {
      window.authService.reconcileShareTags().then(() => {
        updateAuthUI();
      });
    }
  } else {
    if (userInfo) {
      userInfo.remove();
    }
  }

  const authEntrySignedIn = document.getElementById('authEntrySignedIn');
  const authEntryEmail = document.getElementById('authEntryEmail');
  const authEntrySyncStatus = document.getElementById('authEntrySyncStatus');
  const authEntryAccountBtn = document.getElementById('authEntryAccountBtn');
  const authEntryActions = document.getElementById('authEntryActions');

  if (authEntryActions) {
    authEntryActions.style.display = user ? 'none' : 'flex';
  }
  if (authEntrySignedIn) {
    authEntrySignedIn.style.display = user ? 'block' : 'none';
  }
  if (authEntryEmail) {
    authEntryEmail.textContent = user ? user.email : '';
  }
  if (authEntrySyncStatus) {
    authEntrySyncStatus.textContent = sharing ? 'Synced' : 'Local only';
    authEntrySyncStatus.classList.toggle('no-sync', !sharing);
  }
  if (authEntryAccountBtn && user) {
    authEntryAccountBtn.onclick = () => showAccountModal(user);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('authStateChanged', () => {
  updateAuthUI();
});

window.addEventListener('storage', (event) => {
  if (event.key === 'mnemomark-auth-state' || event.key === 'mnemomark-auth-sync') {
    updateAuthUI();
  }
});

window.addEventListener('tagsSynced', () => {
  if (typeof loadTags === 'function') {
    loadTags();
  }
  if (typeof renderTags === 'function') {
    renderTags();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAuthUI);
} else {
  setupAuthUI();
}

function initAccountModal() {
  const accountModal = document.getElementById('accountModal');
  if (!accountModal || accountModal.dataset.initialized === 'true') {
    return;
  }
  accountModal.dataset.initialized = 'true';

  const closeAccountModalBtn = document.getElementById('closeAccountModal');
  const cancelAccountBtn = document.getElementById('cancelAccountBtn');
  const accountSignOutBtn = document.getElementById('accountSignOutBtn');
  const accountDeleteBtn = document.getElementById('accountDeleteBtn');

  const hideModal = () => {
    accountModal.classList.remove('show');
  };

  if (closeAccountModalBtn) {
    closeAccountModalBtn.addEventListener('click', hideModal);
  }
  if (cancelAccountBtn) {
    cancelAccountBtn.addEventListener('click', hideModal);
  }
  if (accountSignOutBtn) {
    accountSignOutBtn.addEventListener('click', async () => {
      await window.authService.signOut();
      hideModal();
      updateAuthUI();
    });
  }
  if (accountDeleteBtn) {
    accountDeleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this account? This cannot be undone.')) return;
      const result = await window.authService.deleteAccount();
      if (!result.success) {
        showError(result.error || 'Delete account failed.');
        return;
      }
      hideModal();
      updateAuthUI();
    });
  }

  accountModal.addEventListener('click', (event) => {
    if (event.target === accountModal) {
      hideModal();
    }
  });
}

function showAccountModal(user) {
  const accountModal = document.getElementById('accountModal');
  if (!accountModal || !user) return;
  const accountEmail = document.getElementById('accountEmail');
  if (accountEmail) {
    accountEmail.textContent = user ? user.email : '';
  }
  const accountUid = document.getElementById('accountUid');
  if (accountUid) {
    accountUid.textContent = user ? user.uid : '';
  }
  accountModal.classList.add('show');
}

window.authUI = {
  showAuthModal,
  showAccountModal,
  updateAuthUI
};
