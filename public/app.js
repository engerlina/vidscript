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

  // Create usage counter element
  const usageCounterContainer = document.createElement('div');
  usageCounterContainer.className = 'usage-counter text-sm text-center mx-auto mb-4';
  usageCounterContainer.id = 'usage-counter';
  usageCounterContainer.textContent = 'Loading usage information...';

  // Insert the usage counter before the input container
  const inputContainer = document.querySelector('.input-container');
  if (inputContainer && inputContainer.parentNode) {
    inputContainer.parentNode.insertBefore(usageCounterContainer, inputContainer);
  }

  // Function to fetch and update usage count
  function updateUsageCount() {
    fetch('/usage-count')
      .then(response => {
        // Check if the response is OK (status in the range 200-299)
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          console.error('Error fetching usage count:', data.error);
          // Still update the UI with the fallback data provided
        }
        
        const usageCounter = document.getElementById('usage-counter');
        if (usageCounter) {
          const userType = data.isLoggedIn ? 'Logged-in user' : 'Free user';
          
          // Format the text based on remaining uses
          let usageText;
          if (data.remainingUses <= 0) {
            usageText = `${userType}: ${data.usageCount}/${data.maxUsageCount} uses today (0 remaining)`;
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-danger';
          } else if (data.remainingUses === 1) {
            usageText = `${userType}: ${data.remainingUses} use remaining today`;
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-warning';
          } else if (data.remainingUses <= 2) {
            usageText = `${userType}: ${data.remainingUses} uses remaining today`;
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-warning';
          } else {
            usageText = `${userType}: ${data.remainingUses} uses remaining today`;
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4';
          }
          
          // Set the counter text
          usageCounter.textContent = usageText;
        }
      })
      .catch(error => {
        console.error('Failed to fetch usage count:', error);
        
        // Set a default message in the usage counter
        const usageCounter = document.getElementById('usage-counter');
        if (usageCounter) {
          usageCounter.textContent = 'Usage count unavailable';
          usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-gray-400';
        }
        
        // Retry after 5 seconds if it's a network error
        setTimeout(() => {
          updateUsageCount();
        }, 5000);
      });
  }

  // Update usage count on page load
  updateUsageCount();

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
      .then(response => {
        // Store the status code to check for rate limiting
        const status = response.status;
        return response.json().then(data => {
          return { data, status };
        });
      })
      .then(({ data, status }) => {
        console.log('Transcription data received:', data);

        // Reset button state
        transcribeBtn.disabled = false;
        buttonText.textContent = 'Transcribe';
        transcribeBtn.querySelector('svg').classList.remove('hidden');
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
          spinner.remove();
        }

        // Update usage count after transcription
        updateUsageCount();

        if (data.error) {
          console.error('Error from server:', data.error);
          
          // Check if it's a rate limit error (HTTP 429)
          if (status === 429) {
            // Create a more user-friendly rate limit message
            const errorContainer = document.createElement('div');
            errorContainer.className = 'alert alert-error shadow-lg mb-4';
            errorContainer.innerHTML = `
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <h3 class="font-bold">Rate Limit Reached</h3>
                  <div class="text-xs">${data.error}</div>
                  ${!window.Clerk?.user ? '<div class="mt-2"><button id="signInBtn" class="btn btn-sm btn-primary">Sign In for More Uses</button></div>' : ''}
                </div>
              </div>
            `;
            
            // Insert the error message at the top of the page
            const container = document.querySelector('.container');
            container.insertBefore(errorContainer, container.firstChild);
            
            // Add event listener for sign in button if it exists
            const signInBtn = document.getElementById('signInBtn');
            if (signInBtn) {
              signInBtn.addEventListener('click', () => {
                window.Clerk?.openSignIn();
              });
            }
            
            // Auto-remove the alert after 10 seconds
            setTimeout(() => {
              errorContainer.classList.add('fade-out');
              setTimeout(() => {
                errorContainer.remove();
              }, 500);
            }, 10000);
          } else {
            // Regular error alert for non-rate-limit errors
            alert('Error: ' + data.error);
          }
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
      }
    });
  };
  
  // Enable buttons when Clerk is ready
  const enableAuthButtons = () => {
    const buttons = document.querySelectorAll('#sign-in-button, #sign-up-button, #dropdown-sign-in-button, #dropdown-sign-up-button');
    buttons.forEach(button => {
      if (button) {
        button.disabled = false;
      }
    });
  };
  
  function areClerkComponentsReady() {
    // First check our custom flag
    if (window.__clerkComponentsReady === true) {
        return true;
    }
    
    // Double-check with Clerk's internal state if possible
    if (window.Clerk && window.Clerk.components && window.Clerk.components.ready) {
        return true;
    }
    
    // Check if we have the necessary components
    if (window.Clerk && 
        typeof window.Clerk.mountSignIn === 'function' && 
        typeof window.Clerk.mountSignUp === 'function') {
        return true;
    }
    
    return false;
  }

  // Function to handle sign-in
  function handleSignIn(e) {
    e.preventDefault();
    
    // Check if Clerk is initialized
    if (!isClerkInitialized()) {
      alert('Authentication system is not ready. Please try again in a moment.');
      return;
    }
    
    // Check if the publishable key is missing
    if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
      window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
    }
    
    // Open the sign-in modal
    try {
      window.Clerk.openSignIn({
        fallbackRedirectUrl: window.location.href,
      });
    } catch (error) {
      alert('There was an error opening the sign-in modal. Please try again.');
    }
  }
  
  // Function to handle sign-up
  function handleSignUp(e) {
    e.preventDefault();
    
    // Check if Clerk is initialized
    if (!isClerkInitialized()) {
      alert('Authentication system is not ready. Please try again in a moment.');
      return;
    }
    
    // Check if the publishable key is missing
    if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
      window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
    }
    
    // Open the sign-up modal
    try {
      window.Clerk.openSignUp({
        fallbackRedirectUrl: window.location.href,
      });
    } catch (error) {
      alert('There was an error opening the sign-up modal. Please try again.');
    }
  }
  
  // Helper function to handle sign out
  function handleSignOut(e) {
    e.preventDefault();
    
    // Check if Clerk is initialized
    if (!window.Clerk) {
      return;
    }
    
    try {
      // Call Clerk's signOut method
      window.Clerk.signOut()
        .then(() => {
          // Update UI to reflect signed out state
          updateUIForAuthState(null);
        })
        .catch(error => {
          // Silent error handling
        });
    } catch (error) {
      // Silent error handling
    }
  }
  
  // Function to set up the auth buttons
  function setupAuthButtons() {
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
    }
    
    if (signUpButton) {
      // Remove any existing listeners to prevent duplicates
      signUpButton.replaceWith(signUpButton.cloneNode(true));
      const newSignUpButton = document.getElementById('sign-up-button');
      
      newSignUpButton.addEventListener('click', handleSignUp);
    }

    // Buttons for smaller screens (dropdown)
    const dropdownSignInButton = document.getElementById('dropdown-sign-in-button');
    const dropdownSignUpButton = document.getElementById('dropdown-sign-up-button');
    
    if (dropdownSignInButton) {
      // Remove any existing listeners to prevent duplicates
      dropdownSignInButton.replaceWith(dropdownSignInButton.cloneNode(true));
      const newDropdownSignInButton = document.getElementById('dropdown-sign-in-button');
      
      newDropdownSignInButton.addEventListener('click', handleSignIn);
    }
    
    if (dropdownSignUpButton) {
      // Remove any existing listeners to prevent duplicates
      dropdownSignUpButton.replaceWith(dropdownSignUpButton.cloneNode(true));
      const newDropdownSignUpButton = document.getElementById('dropdown-sign-up-button');
      
      newDropdownSignUpButton.addEventListener('click', handleSignUp);
    }
  }
  
  function setupSignOutButtons() {
    // Get all sign-out buttons
    const signOutButtons = document.querySelectorAll('#sign-out-button, #sign-out-button-small');
    
    // Add click event listeners to all sign-out buttons
    signOutButtons.forEach(button => {
      if (button) {
        // Remove any existing event listeners to prevent duplicates
        button.removeEventListener('click', handleSignOut);
        
        // Add the event listener
        button.addEventListener('click', handleSignOut);
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
            // Silent error handling
          }
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
            // Silent error handling
          }
        }
      });
    }
  }
  
  // Function to update UI based on user authentication state
  function updateUIForAuthState(user) {
    const userButtons = document.getElementById('userButtons');
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarDropdown = document.getElementById('userAvatarDropdown');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const userAvatarImgSmall = document.getElementById('userAvatarImgSmall');
    
    if (user) {
      // User is signed in
      
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
        if (userAvatarImg) userAvatarImg.src = user.imageUrl;
        if (userAvatarImgSmall) userAvatarImgSmall.src = user.imageUrl;
      } else {
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
    if (!window.Clerk) {
      return;
    }
    
    try {
      // Set up sign-out buttons
      setupSignOutButtons();
      
      // Listen for auth state changes
      window.Clerk.addListener(({ user }) => {
        // Update UI based on auth state
        updateUIForAuthState(user);
        
        // If user is signed in, ensure sign-out buttons are set up
        if (user) {
          setupSignOutButtons();
        }
      });
      
      // Check current user state
      if (window.Clerk.user) {
        updateUIForAuthState(window.Clerk.user);
        setupSignOutButtons();
      } else {
        updateUIForAuthState(null);
      }
    } catch (error) {
      // Silent error handling
    }
  }
  
  // Function to check if Clerk is properly initialized
  function isClerkInitialized() {
    return window.Clerk && 
           typeof window.Clerk.openSignIn === 'function' && 
           typeof window.Clerk.openSignUp === 'function';
  }
  
  // Function to check if Clerk is ready
  function isClerkReady() {
    return window.__clerkReady === true || (window.Clerk && typeof window.Clerk.openSignIn === 'function');
  }
  
  // Initialize Clerk integration
  function initClerk() {
    // Setup auth buttons
    setupAuthButtons();
    
    // Disable buttons until Clerk is ready
    disableAuthButtons();
    
    // Check if Clerk is already initialized
    if (isClerkInitialized()) {
      // Check if components are ready
      if (areClerkComponentsReady()) {
        enableAuthButtons();
        setupClerkListeners();
      }
    }
    
    // Listen for Clerk components ready event
    document.addEventListener('clerk-components-ready', (e) => {
      enableAuthButtons();
      setupClerkListeners();
    });
    
    // Listen for Clerk ready event
    document.addEventListener('clerk-ready', (e) => {
      setupClerkListeners();
    });
    
    // Fallback: Check periodically if Clerk components are ready
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds (100ms * 30)
    
    const checkClerkReady = setInterval(() => {
      attempts++;
      
      // Check if Clerk is initialized and components are ready
      if (isClerkInitialized() && areClerkComponentsReady()) {
        clearInterval(checkClerkReady);
        enableAuthButtons();
        return;
      }
      
      // If we've reached the maximum number of attempts, enable buttons anyway
      if (attempts >= maxAttempts) {
        clearInterval(checkClerkReady);
        enableAuthButtons();
        
        // Try to initialize Clerk directly as a last resort
        if (window.Clerk && !window.Clerk.publishableKey) {
          if (typeof CLERK_KEY !== 'undefined') {
            window.Clerk.publishableKey = CLERK_KEY;
          } else {
            // Try to get the key from the meta tag
            const metaTag = document.querySelector('meta[name="clerk-publishable-key"]');
            if (metaTag) {
              const key = metaTag.getAttribute('content');
              if (key) {
                window.Clerk.publishableKey = key;
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