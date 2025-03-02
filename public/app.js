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
  
  // Helper function to handle sign in
  function handleSignIn(e) {
    if (e) e.preventDefault();
    console.log('Sign-in function called');
    
    if (!isClerkReady()) {
      console.warn('Clerk is not fully ready yet. Please wait a moment and try again.');
      alert('Authentication is still initializing. Please wait a moment and try again.');
      return;
    }
    
    if (window.Clerk && typeof window.Clerk.openSignIn === 'function') {
      try {
        window.Clerk.openSignIn({
          redirectUrl: window.location.href,
          appearance: {
            elements: {
              rootBox: {
                boxShadow: 'none',
                width: '100%',
                maxWidth: '400px'
              }
            }
          }
        });
      } catch (error) {
        console.error('Error opening sign in:', error);
        alert('Error opening sign in. Please try again.');
      }
    } else {
      console.error('Clerk not available for sign in');
      alert('Authentication is still initializing. Please try again in a moment.');
    }
  }
  
  // Helper function to handle sign up
  function handleSignUp(e) {
    if (e) e.preventDefault();
    console.log('Sign-up function called');
    
    if (!isClerkReady()) {
      console.warn('Clerk is not fully ready yet. Please wait a moment and try again.');
      alert('Authentication is still initializing. Please wait a moment and try again.');
      return;
    }
    
    if (window.Clerk && typeof window.Clerk.openSignUp === 'function') {
      try {
        window.Clerk.openSignUp({
          redirectUrl: window.location.href,
          appearance: {
            elements: {
              rootBox: {
                boxShadow: 'none',
                width: '100%',
                maxWidth: '400px'
              }
            }
          }
        });
      } catch (error) {
        console.error('Error opening sign up:', error);
        alert('Error opening sign up. Please try again.');
      }
    } else {
      console.error('Clerk not available for sign up');
      alert('Authentication is still initializing. Please try again in a moment.');
    }
  }
  
  // Helper function to handle sign out
  function handleSignOut(e) {
    if (e) e.preventDefault();
    console.log('Sign-out function called');
    
    if (!isClerkReady()) {
      console.warn('Clerk is not fully ready yet. Please wait a moment and try again.');
      alert('Authentication is still initializing. Please wait a moment and try again.');
      return;
    }
    
    if (window.Clerk && typeof window.Clerk.signOut === 'function') {
      try {
        window.Clerk.signOut()
          .then(() => {
            console.log('Successfully signed out');
            location.reload();
          })
          .catch(error => {
            console.error('Error during sign out:', error);
            // Reload anyway to reset the UI
            location.reload();
          });
      } catch (error) {
        console.error('Error calling signOut:', error);
        // Reload anyway to reset the UI
        location.reload();
      }
    } else {
      console.error('Clerk not available for sign out');
      // Reload anyway to reset the UI
      location.reload();
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
    const signOutButton = document.getElementById('sign-out-button');
    const signOutButtonSmall = document.getElementById('sign-out-button-small');
    
    if (signOutButton) {
      // Remove any existing listeners to prevent duplicates
      signOutButton.replaceWith(signOutButton.cloneNode(true));
      const newSignOutButton = document.getElementById('sign-out-button');
      
      newSignOutButton.addEventListener('click', handleSignOut);
      console.log('Added click listener to sign-out button');
    }
    
    if (signOutButtonSmall) {
      // Remove any existing listeners to prevent duplicates
      signOutButtonSmall.replaceWith(signOutButtonSmall.cloneNode(true));
      const newSignOutButtonSmall = document.getElementById('sign-out-button-small');
      
      newSignOutButtonSmall.addEventListener('click', handleSignOut);
      console.log('Added click listener to small sign-out button');
    }
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
  
  function setupClerkListeners() {
    const userButtons = document.getElementById('userButtons');
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const userAvatarDropdown = document.getElementById('userAvatarDropdown');

    // Set up sign out and profile buttons
    setupSignOutButtons();
    setupProfileButtons();

    if (window.Clerk && typeof window.Clerk.addListener === 'function') {
      try {
        // Use a safer approach to add the listener
        const unsubscribe = window.Clerk.addListener(({ user }) => {
          console.log("Clerk user state changed:", user ? "Signed in" : "Signed out");
          
          if (user) {
            // User is signed in
            if (userButtons) userButtons.style.display = 'none';
            if (userAvatar) userAvatar.style.display = 'block';
            if (userAvatarDropdown) userAvatarDropdown.style.display = 'block';
            if (hamburgerMenu) hamburgerMenu.style.display = 'none';
        
            // Set the user's profile image URL
            if (userAvatarImg) userAvatarImg.src = user.imageUrl;
            const userAvatarImgSmall = document.getElementById('userAvatarImgSmall');
            if (userAvatarImgSmall) userAvatarImgSmall.src = user.imageUrl;
          } else {
            // User is not signed in
            if (userButtons) userButtons.style.display = 'block';
            if (userAvatar) userAvatar.style.display = 'none';
            if (userAvatarDropdown) userAvatarDropdown.style.display = 'none';
            if (hamburgerMenu) hamburgerMenu.style.display = 'block';
          }
        });
        
        // Store the unsubscribe function for cleanup if needed
        window.__clerkUnsubscribe = unsubscribe;
      } catch (error) {
        console.error('Error setting up Clerk listener:', error);
      }
    } else {
      console.error('Clerk addListener method not available');
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
    console.log('Initializing Clerk integration');
    
    // Set up auth buttons first
    setupAuthButtons();
    
    // Check if Clerk is already available and ready
    if (isClerkInitialized() && isClerkReady()) {
      console.log('Clerk is already initialized and ready');
      enableAuthButtons();
      setupClerkListeners();
      return;
    }
    
    // Listen for the custom event from index.ejs
    document.addEventListener('clerk-ready', function(event) {
      console.log('Received clerk-ready event', event.detail);
      
      // Wait a short time to ensure Clerk is fully initialized
      setTimeout(function() {
        if (event.detail && event.detail.success === true) {
          console.log('Clerk initialized successfully');
          if (isClerkInitialized()) {
            enableAuthButtons();
            setupClerkListeners();
          } else {
            console.warn('Clerk methods not available yet, waiting...');
            // Try again after a short delay
            setTimeout(function() {
              if (isClerkInitialized()) {
                console.log('Clerk methods now available');
                enableAuthButtons();
                setupClerkListeners();
              } else {
                console.error('Clerk methods still not available');
                // Enable buttons anyway to prevent UI from being stuck
                enableAuthButtons();
              }
            }, 1000);
          }
        } else {
          console.warn('Clerk initialization failed:', event.detail ? event.detail.error : 'unknown error');
          // Enable buttons anyway to prevent UI from being stuck
          enableAuthButtons();
        }
      }, 500);
    });
    
    // Fallback: check periodically for Clerk
    const maxChecks = 50; // Check for 5 seconds max (50 * 100ms)
    let checkCount = 0;
    
    const waitForClerk = setInterval(() => {
      checkCount++;
      
      if (isClerkInitialized() && isClerkReady()) {
        console.log('Clerk object found and ready after polling');
        clearInterval(waitForClerk);
        enableAuthButtons();
        setupClerkListeners();
      } else if (checkCount >= maxChecks) {
        console.error('Clerk initialization timed out after 5 seconds');
        clearInterval(waitForClerk);
        // Enable buttons anyway to prevent UI from being stuck
        enableAuthButtons();
      }
    }, 100);
  }
  
  // Start Clerk initialization
  initClerk();
});