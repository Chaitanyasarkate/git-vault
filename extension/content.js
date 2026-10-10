/**
 * Git-Pass Content Script
 * Allows 1-click credential filling on login forms
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FILL_CREDENTIALS') {
    const { username, password } = request;
    fillForm(username, password);
    sendResponse({ success: true });
  }
  return true;
});

function fillForm(username, password) {
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
  
  if (passwordInputs.length > 0) {
    const pwdInput = passwordInputs[0];
    pwdInput.value = password;
    pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
    pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Find corresponding username input
    const form = pwdInput.closest('form');
    let userInput = null;

    if (form) {
      userInput = form.querySelector('input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"], input[type="text"][name*="login"], input[type="text"][autocomplete*="username"]');
    }
    if (!userInput) {
      userInput = document.querySelector('input[type="email"], input[autocomplete="username"], input[name*="user"], input[name*="login"]');
    }

    if (userInput && username) {
      userInput.value = username;
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      userInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}
