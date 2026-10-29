// Apply the quiet first-launch layout before the main workspace can flash on screen.
try{if(OnboardingState.create(localStorage).shouldStart())document.documentElement.classList.add('onboarding-pending');}catch{}
