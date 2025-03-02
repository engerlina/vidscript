document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  const transcribeBtn = document.getElementById('transcribeBtn');
  const results = document.getElementById('results');
  const thumbnail = document.getElementById('thumbnail');
  const transcription = document.getElementById('transcription');
  const copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
  const downloadTxtBtn = document.getElementById('downloadTxtBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const languageModal = document.getElementById('language-modal');
  const languageOptionsContainer = document.getElementById('language-options');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const buttonText = document.getElementById('buttonText');

  function showModal() {
    console.log('Showing modal');
    languageModal.classList.add('show');
  }

  function hideModal() {
    console.log('Hiding modal');
    languageModal.classList.remove('show');
  }

  closeModalBtn.addEventListener('click', hideModal);

  const getYouTubeVideoId = (url) => {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const matches = url.match(regex);
    console.log(`URL matches: ${matches}`);
    return matches ? matches[1] : null;
  };

  function transcribeVideo() {
    const url = urlInput.value;
    console.log(`URL input: ${url}`);
    const videoId = getYouTubeVideoId(url);
    console.log(`Extracted video ID: ${videoId}`);

    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }

    // Change button to loading state
    transcribeBtn.disabled = true;
    buttonText.textContent = 'Loading...';
    transcribeBtn.querySelector('svg').classList.add('hidden');
    const spinner = document.createElement('span');
    spinner.className = 'loading loading-spinner mr-2';
    spinner.id = 'loadingSpinner';
    transcribeBtn.insertBefore(spinner, buttonText);

    fetch('/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    })
      .then(response => response.json())
      .then(data => {
        console.log('Transcription data received:', data);

        if (data.error) {
          console.error('Error from server:', data.error);
          alert('Error: ' + data.error);
          return;
        }

        if (!data.savedTranscripts) {
          console.error('No saved transcripts data found');
          alert('No saved transcripts data available');
          return;
        }

        // Update the UI with the transcription data
        thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        results.classList.remove('hidden');

        if (data.languageCodes.length > 1) {
          console.log('Multiple languages available:', data.languageCodes);
          languageOptionsContainer.innerHTML = '';

          data.languageCodes.forEach(language => {
            const button = document.createElement('button');
            button.className = 'btn btn-neutral';
            button.textContent = language.name;
            button.addEventListener('click', () => handleLanguageSelection(videoId, language.code));
            languageOptionsContainer.appendChild(button);
          });

          showModal();
        } else {
          console.log('Only one language available:', data.languageCodes);
          // If only one language is available, display the transcription directly
          const languageCode = data.languageCodes[0].code;
          const savedTranscript = data.savedTranscripts.find(transcript => transcript.languageCode === languageCode);
          if (savedTranscript) {
            displayTranscription(savedTranscript);
          } else {
            console.error('No transcript found for the selected language');
            alert('No transcript found for the selected language');
          }
        }
      })
      .catch(error => {
        console.error('An error occurred while fetching the transcription:', error);
        alert('An error occurred while fetching the transcription');
      })
      .finally(() => {
        // Revert button to original state
        transcribeBtn.disabled = false;
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
          loadingSpinner.remove();
        }
        buttonText.textContent = 'Transcribe';
        transcribeBtn.querySelector('svg').classList.remove('hidden');
      });
  }

  async function handleLanguageSelection(videoId, languageCode) {
    console.log(`Language selected: ${languageCode}`);
    try {
      const response = await fetch(`/transcribe/${videoId}/${languageCode}`);
      const transcriptData = await response.json();
      console.log('Transcript data received for selected language:', transcriptData);

      if (transcriptData.error) {
        console.error('Error from server:', transcriptData.error);
        alert('Error: ' + transcriptData.error);
        return;
      }

      const savedTranscript = transcriptData.savedTranscripts.find(transcript => transcript.languageCode === languageCode);
      if (savedTranscript) {
        displayTranscription(savedTranscript);
        hideModal();
      } else {
        console.error('No transcript found for the selected language');
        alert('No transcript found for the selected language');
      }
    } catch (error) {
      console.error('An error occurred while fetching the transcription:', error);
      alert('An error occurred while fetching the transcription');
    }
  }

  function displayTranscription(savedTranscript) {
    transcription.textContent = savedTranscript.subtitlesText;
    downloadTxtBtn.setAttribute('data-filename', savedTranscript.txtFilename);
    downloadCsvBtn.setAttribute('data-filename', savedTranscript.csvFilename);
  }

  transcribeBtn.addEventListener('click', transcribeVideo);

  copyTranscriptionBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(transcription.textContent)
      .then(() => {
        alert('Transcription copied to clipboard!');
      })
      .catch((error) => {
        console.error('Failed to copy transcription:', error);
      });
  });

  downloadTxtBtn.addEventListener('click', async () => {
    const filename = downloadTxtBtn.getAttribute('data-filename');
    if (filename) {
      try {
        const response = await fetch(`/download-txt/${filename}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } catch (error) {
        console.error('An error occurred while downloading the TXT file:', error);
      }
    }
  });

  downloadCsvBtn.addEventListener('click', async () => {
    const filename = downloadCsvBtn.getAttribute('data-filename');
    if (filename) {
      try {
        const response = await fetch(`/download-csv/${filename}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } catch (error) {
        console.error('An error occurred while downloading the CSV file:', error);
      }
    }
  });

  // Clerk authentication handling
  console.log('Setting up Clerk authentication in app.js');

  // Disable buttons until Clerk is ready
  const disableAuthButtons = () => {
    const buttons = document.querySelectorAll('#sign-in-button, #sign-up-button, #dropdown-sign-in-button, #dropdown-sign-up-button');
    buttons.forEach(button => {
      if (button) {
        button.disabled = true;
        console.log(`Disabled button: ${button.id}`);
      }
    });
  };
  
  // Enable buttons when Clerk is ready
  const enableAuthButtons = () => {
    const buttons = document.querySelectorAll('#sign-in-button, #sign-up-button, #dropdown-sign-in-button, #dropdown-sign-up-button');
    buttons.forEach(button => {
      if (button) {
        button.disabled = false;
        console.log(`Enabled button: ${button.id}`);
      }
    });
  };
  
  // Function to check if Clerk components are ready
  function areClerkComponentsReady() {
    // First check our custom flag
    if (window.__clerkComponentsReady === true) {
        console.log("[DEBUG] areClerkComponentsReady: true (from __clerkComponentsReady flag)");
        return true;
    }
    
    // Double-check with Clerk's internal state if possible
    try {
      // Check if Clerk exists and has been initialized
      if (!window.Clerk) {
        console.log("[DEBUG] areClerkComponentsReady: false (Clerk object doesn't exist)");
        return false;
      }
      
      // Check if publishable key is set
      if (!window.Clerk.publishableKey) {
        console.log("[DEBUG] areClerkComponentsReady: false (publishableKey not set)");
        // Try to set it if we have it stored
        if (typeof CLERK_KEY !== 'undefined') {
          console.log("[DEBUG] Setting publishable key from CLERK_KEY variable");
          window.Clerk.publishableKey = CLERK_KEY;
        }
        return false;
      }
      
      // Check if components exist and are ready
      if (window.Clerk.components && 
          typeof window.Clerk.components.isReady === 'boolean' && 
          window.Clerk.components.isReady === true) {
        console.log("[DEBUG] areClerkComponentsReady: true (from Clerk.components.isReady)");
        return true;
      }
      
      // Check if we can access our custom internal ready state
      if (window.Clerk.components && 
          typeof window.Clerk.components.__internal_isReady === 'boolean' && 
          window.Clerk.components.__internal_isReady === true) {
        console.log("[DEBUG] areClerkComponentsReady: true (from __internal_isReady)");
        return true;
      }
      
      // Check if we can open sign-in (functional check)
      if (typeof window.Clerk.openSignIn === 'function') {
        console.log("[DEBUG] areClerkComponentsReady: true (openSignIn is available)");
        // If we can open sign-in, components are probably ready
        window.__clerkComponentsReady = true;
        return true;
      }
      
      console.log("[DEBUG] areClerkComponentsReady: false (no readiness indicators found)");
      return false;
    } catch (error) {
      console.error("[DEBUG] Error in areClerkComponentsReady:", error);
      return false;
    }
  }
  
  // Function to wait for Clerk components to be ready
  function waitForClerkComponents(callback, maxAttempts = 10) {
    let attempts = 0;
    
    function checkComponents() {
      attempts++;
      console.log(`[DEBUG] Checking if Clerk components are ready (attempt ${attempts}/${maxAttempts})`);
      
      // Check if components are ready
      if (areClerkComponentsReady()) {
        console.log("[DEBUG] Clerk components are ready, proceeding with callback");
        callback();
        return;
      }
      
      // If Clerk is initialized but components aren't ready, try to fix it
      if (isClerkInitialized() && !areClerkComponentsReady()) {
        // Check if the publishable key is missing
        if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
          console.log("[DEBUG] Setting missing publishable key in waitForClerkComponents");
          window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
          
          // Try to manually initialize components if needed
          if (typeof window.Clerk.load === 'function' && !window.__clerkLoadCalled) {
            console.log("[DEBUG] Manually calling Clerk.load() in waitForClerkComponents");
            window.__clerkLoadCalled = true;
            
            try {
              window.Clerk.load({
                publishableKey: window.CLERK_PUBLISHABLE_KEY,
                afterLoaded: () => {
                  console.log("[DEBUG] Manual Clerk.load afterLoaded callback fired");
                  window.__clerkComponentsReady = true;
                  callback();
                }
              });
              return; // Wait for the callback
            } catch (e) {
              console.error("[DEBUG] Error during manual Clerk.load():", e);
            }
          }
        }
      }
      
      // If we've reached the maximum number of attempts, proceed anyway
      if (attempts >= maxAttempts) {
        console.log("[DEBUG] Max attempts reached, proceeding anyway");
        
        // Force components to be ready as a last resort
        if (isClerkInitialized()) {
          console.log("[DEBUG] Forcing components ready state");
          window.__clerkComponentsReady = true;
          
          // Create the internal ready state proxy if it doesn't exist
          if (window.Clerk && window.Clerk.components && !('__internal_isReady' in window.Clerk.components)) {
            Object.defineProperty(window.Clerk.components, '__internal_isReady', {
              get: function() { return true; }
            });
          }
        }
        
        callback();
        return;
      }
      
      // Try again after a short delay
      setTimeout(checkComponents, 100);
    }
    
    // Start checking
    checkComponents();
  }
  
  // Function to handle sign-in
  function handleSignIn(e) {
    e.preventDefault();
    console.log('[DEBUG] Sign-in function called');
    
    // Wait for Clerk components to be ready
    waitForClerkComponents(() => {
      try {
        // Check if Clerk is initialized
        if (!isClerkInitialized()) {
          console.error('[DEBUG] Clerk is not initialized');
          alert('Authentication system is not ready. Please try again in a moment.');
          return;
        }
        
        // Check if the publishable key is missing
        if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
          console.log("[DEBUG] Setting missing publishable key in handleSignIn");
          window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
        }
        
        // Open the sign-in modal
        console.log('[DEBUG] Calling Clerk.openSignIn()');
        window.Clerk.openSignIn({
          fallbackRedirectUrl: window.location.href,
        });
      } catch (error) {
        console.error('[DEBUG] Error opening sign-in modal:', error);
        alert('There was an error opening the sign-in modal. Please try again.');
      }
    });
  }
  
  // Function to handle sign-up
  function handleSignUp(e) {
    e.preventDefault();
    console.log('[DEBUG] Sign-up function called');
    
    // Wait for Clerk components to be ready
    waitForClerkComponents(() => {
      try {
        // Check if Clerk is initialized
        if (!isClerkInitialized()) {
          console.error('[DEBUG] Clerk is not initialized');
          alert('Authentication system is not ready. Please try again in a moment.');
          return;
        }
        
        // Check if the publishable key is missing
        if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
          console.log("[DEBUG] Setting missing publishable key in handleSignUp");
          window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
        }
        
        // Open the sign-up modal
        console.log('[DEBUG] Calling Clerk.openSignUp()');
        window.Clerk.openSignUp({
          fallbackRedirectUrl: window.location.href,
        });
      } catch (error) {
        console.error('[DEBUG] Error opening sign-up modal:', error);
        alert('There was an error opening the sign-up modal. Please try again.');
      }
    });
  }
  
  // Helper function to handle sign out
  function handleSignOut(e) {
    e.preventDefault();
    console.log("[DEBUG] Sign-out function called");
    
    // Check if Clerk is initialized
    if (!window.Clerk) {
      console.error("[DEBUG] Clerk is not initialized, cannot sign out");
      return;
    }
    
    try {
      // Call Clerk's signOut method
      window.Clerk.signOut()
        .then(() => {
          console.log("[DEBUG] User signed out successfully");
          // Update UI to reflect signed out state
          updateUIForAuthState(null);
        })
        .catch(error => {
          console.error("[DEBUG] Error signing out:", error);
        });
    } catch (error) {
      console.error("[DEBUG] Error during sign out:", error);
    }
  }
  
  // Function to set up the auth buttons
  function setupAuthButtons() {
    console.log('Setting up auth buttons');
    
    // Initially disable the buttons
    disableAuthButtons();
    
    // Buttons for larger screens
    const signInButton = document.getElementById('sign-in-button');
    const signUpButton = document.getElementById('sign-up-button');
    
    if (signInButton) {
      // Remove any existing listeners to prevent duplicates
      signInButton.replaceWith(signInButton.cloneNode(true));
      const newSignInButton = document.getElementById('sign-in-button');
      
      newSignInButton.addEventListener('click', handleSignIn);
      console.log('Added click listener to sign-in button');
    } else {
      console.warn('Sign-in button not found');
    }
    
    if (signUpButton) {
      // Remove any existing listeners to prevent duplicates
      signUpButton.replaceWith(signUpButton.cloneNode(true));
      const newSignUpButton = document.getElementById('sign-up-button');
      
      newSignUpButton.addEventListener('click', handleSignUp);
      console.log('Added click listener to sign-up button');
    } else {
      console.warn('Sign-up button not found');
    }

    // Buttons for smaller screens (dropdown)
    const dropdownSignInButton = document.getElementById('dropdown-sign-in-button');
    const dropdownSignUpButton = document.getElementById('dropdown-sign-up-button');
    
    if (dropdownSignInButton) {
      // Remove any existing listeners to prevent duplicates
      dropdownSignInButton.replaceWith(dropdownSignInButton.cloneNode(true));
      const newDropdownSignInButton = document.getElementById('dropdown-sign-in-button');
      
      newDropdownSignInButton.addEventListener('click', handleSignIn);
      console.log('Added click listener to dropdown sign-in button');
    } else {
      console.warn('Dropdown Sign-in button not found');
    }
    
    if (dropdownSignUpButton) {
      // Remove any existing listeners to prevent duplicates
      dropdownSignUpButton.replaceWith(dropdownSignUpButton.cloneNode(true));
      const newDropdownSignUpButton = document.getElementById('dropdown-sign-up-button');
      
      newDropdownSignUpButton.addEventListener('click', handleSignUp);
      console.log('Added click listener to dropdown sign-up button');
    } else {
      console.warn('Dropdown Sign-up button not found');
    }
  }
  
  function setupSignOutButtons() {
    console.log("[DEBUG] Setting up sign-out buttons");
    
    // Get all sign-out buttons
    const signOutButtons = document.querySelectorAll('#sign-out-button, #sign-out-button-small');
    
    // Add click event listeners to all sign-out buttons
    signOutButtons.forEach(button => {
      if (button) {
        // Remove any existing event listeners to prevent duplicates
        button.removeEventListener('click', handleSignOut);
        
        // Add the event listener
        button.addEventListener('click', handleSignOut);
        console.log(`[DEBUG] Added click listener to sign-out button: ${button.id}`);
      }
    });
  }
  
  function setupProfileButtons() {
    const profileLink = document.getElementById('profile-link');
    const profileLinkSmall = document.getElementById('profile-link-small');
    
    if (profileLink) {
      profileLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.Clerk && typeof window.Clerk.openUserProfile === 'function') {
          try {
            window.Clerk.openUserProfile();
          } catch (error) {
            console.error('Error opening user profile:', error);
          }
        } else {
          console.error('Clerk not available for user profile');
        }
      });
    }
    
    if (profileLinkSmall) {
      profileLinkSmall.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.Clerk && typeof window.Clerk.openUserProfile === 'function') {
          try {
            window.Clerk.openUserProfile();
          } catch (error) {
            console.error('Error opening user profile:', error);
          }
        } else {
          console.error('Clerk not available for small user profile');
        }
      });
    }
  }
  
  // Function to update UI based on user authentication state
  function updateUIForAuthState(user) {
    console.log("[DEBUG] Updating UI for auth state:", user ? "Signed in" : "Signed out");
    
    const userButtons = document.getElementById('userButtons');
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarDropdown = document.getElementById('userAvatarDropdown');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const userAvatarImgSmall = document.getElementById('userAvatarImgSmall');
    
    if (user) {
      // User is signed in
      console.log("[DEBUG] User is signed in, updating UI");
      
      // Hide sign-in/sign-up buttons
      if (userButtons) {
        userButtons.style.display = 'none';
      }
      
      // Show user avatar in navbar
      if (userAvatar) {
        userAvatar.style.display = 'block';
      }
      
      // Show user avatar in mobile dropdown
      if (userAvatarDropdown) {
        userAvatarDropdown.style.display = 'block';
      }
      
      // Set user avatar image
      if (user.imageUrl) {
        console.log("[DEBUG] Setting user avatar image:", user.imageUrl);
        if (userAvatarImg) userAvatarImg.src = user.imageUrl;
        if (userAvatarImgSmall) userAvatarImgSmall.src = user.imageUrl;
      } else {
        console.log("[DEBUG] No user image available, using default");
        const defaultImage = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
        if (userAvatarImg) userAvatarImg.src = defaultImage;
        if (userAvatarImgSmall) userAvatarImgSmall.src = defaultImage;
      }
      
      // Set up profile links
      const profileLinks = document.querySelectorAll('#profile-link, #profile-link-small');
      profileLinks.forEach(link => {
        if (link) {
          link.href = '/profile';
        }
      });
    } else {
      // User is signed out
      console.log("[DEBUG] User is signed out, updating UI");
      
      // Show sign-in/sign-up buttons
      if (userButtons) {
        userButtons.style.display = 'block';
      }
      
      // Hide user avatar in navbar
      if (userAvatar) {
        userAvatar.style.display = 'none';
      }
      
      // Hide user avatar in mobile dropdown
      if (userAvatarDropdown) {
        userAvatarDropdown.style.display = 'none';
      }
    }
  }

  function setupClerkListeners() {
    console.log("[DEBUG] Setting up Clerk listeners");
    
    if (!window.Clerk) {
      console.log("[DEBUG] Clerk not available for listeners");
      return;
    }
    
    try {
      // Set up sign-out buttons
      setupSignOutButtons();
      
      // Listen for auth state changes
      window.Clerk.addListener(({ user }) => {
        console.log("[DEBUG] Clerk auth state changed:", user ? "Signed in" : "Signed out");
        
        // Update UI based on auth state
        updateUIForAuthState(user);
        
        // If user is signed in, ensure sign-out buttons are set up
        if (user) {
          setupSignOutButtons();
        }
      });
      
      // Check current user state
      if (window.Clerk.user) {
        console.log("[DEBUG] User already signed in:", window.Clerk.user.fullName || window.Clerk.user.primaryEmailAddress);
        updateUIForAuthState(window.Clerk.user);
        setupSignOutButtons();
      } else {
        console.log("[DEBUG] No user currently signed in");
        updateUIForAuthState(null);
      }
    } catch (error) {
      console.error("[DEBUG] Error setting up Clerk listeners:", error);
    }
  }
  
  // Function to check if Clerk is properly initialized
  function isClerkInitialized() {
    const initialized = window.Clerk && 
           typeof window.Clerk.openSignIn === 'function' && 
           typeof window.Clerk.openSignUp === 'function';
    console.log("[DEBUG] isClerkInitialized check:", initialized);
    return initialized;
  }
  
  // Function to check if Clerk is ready
  function isClerkReady() {
    const ready = window.__clerkReady === true || (window.Clerk && typeof window.Clerk.openSignIn === 'function');
    console.log("[DEBUG] isClerkReady check:", ready);
    return ready;
  }
  
  // Initialize Clerk integration
  function initClerk() {
    console.log("[DEBUG] Initializing Clerk integration");
    
    // Setup auth buttons
    setupAuthButtons();
    
    // Disable buttons until Clerk is ready
    disableAuthButtons();
    
    // Check if Clerk is already initialized
    if (isClerkInitialized()) {
      console.log("[DEBUG] Clerk is already initialized");
      
      // Check if components are ready
      if (areClerkComponentsReady()) {
        console.log("[DEBUG] Clerk components are already ready");
        enableAuthButtons();
        setupClerkListeners();
      }
    }
    
    // Listen for Clerk components ready event
    document.addEventListener('clerk-components-ready', (e) => {
      console.log("[DEBUG] clerk-components-ready event received", e.detail);
      enableAuthButtons();
      setupClerkListeners();
    });
    
    // Listen for Clerk ready event
    document.addEventListener('clerk-ready', (e) => {
      console.log("[DEBUG] clerk-ready event received", e.detail);
      setupClerkListeners();
    });
    
    // Fallback: Check periodically if Clerk components are ready
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds (100ms * 30)
    
    const checkClerkReady = setInterval(() => {
      attempts++;
      
      // Log every 10 attempts
      if (attempts % 10 === 0) {
        console.log(`[DEBUG] Still waiting for Clerk (check ${attempts}/${maxAttempts})`);
        console.log("[DEBUG] Clerk debug info:", JSON.stringify(window.__clerkDebugInfo || {}));
      }
      
      // Check if Clerk is initialized and components are ready
      if (isClerkInitialized() && areClerkComponentsReady()) {
        clearInterval(checkClerkReady);
        console.log("[DEBUG] Clerk components are now ready");
        enableAuthButtons();
        return;
      }
      
      // If we've reached the maximum number of attempts, enable buttons anyway
      if (attempts >= maxAttempts) {
        clearInterval(checkClerkReady);
        console.log("[DEBUG] Clerk initialization timed out after 3 seconds");
        enableAuthButtons();
        
        // Log the final state for debugging
        console.log("[DEBUG] Final state at timeout:");
        console.log("[DEBUG] window.Clerk exists:", !!window.Clerk);
        console.log("[DEBUG] isClerkInitialized:", isClerkInitialized());
        console.log("[DEBUG] isClerkReady:", isClerkReady());
        console.log("[DEBUG] areClerkComponentsReady:", areClerkComponentsReady());
        console.log("[DEBUG] Clerk debug info:", JSON.stringify(window.__clerkDebugInfo || {}));
        
        // Try to initialize Clerk directly as a last resort
        if (window.Clerk && !window.Clerk.publishableKey) {
          console.log("[DEBUG] Attempting to set publishable key directly");
          if (typeof CLERK_KEY !== 'undefined') {
            window.Clerk.publishableKey = CLERK_KEY;
            console.log("[DEBUG] Set publishable key to:", CLERK_KEY);
          } else {
            // Try to get the key from the meta tag
            const metaTag = document.querySelector('meta[name="clerk-publishable-key"]');
            if (metaTag) {
              const key = metaTag.getAttribute('content');
              if (key) {
                window.Clerk.publishableKey = key;
                console.log("[DEBUG] Set publishable key from meta tag:", key);
              }
            }
          }
        }
      }
    }, 100);
  }
  
  // Start Clerk initialization
  initClerk();
});