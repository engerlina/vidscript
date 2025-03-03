document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('urlInput');
  const transcribeBtn = document.getElementById('transcribeBtn');
  let results = document.getElementById('results');
  let thumbnail = document.getElementById('thumbnail');
  let transcription = document.getElementById('transcription');
  let copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
  let downloadTxtBtn = document.getElementById('downloadTxtBtn');
  let downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const languageModal = document.getElementById('language-modal');
  const languageOptionsContainer = document.getElementById('language-options');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const buttonText = document.getElementById('buttonText');

  // Initial setup with a delay to ensure DOM is fully loaded
  setTimeout(() => {
    // Setup auth-related buttons first
    setupAuthButtons();
    
    // Then apply visibility based on current state
    applyResponsiveVisibility();
    
    // Setup Clerk listeners
    if (window.Clerk) {
      setupClerkListeners();
    } else {
      // If Clerk is not yet available, wait for it
      document.addEventListener('clerk-ready', () => {
        setupClerkListeners();
      });
    }
  }, 300);

  // Store CSRF token
  let csrfToken = '';

  // Store usage limits
  let usageLimits = {
    freeUserLimit: 2,
    loggedInUserLimit: 3
  };

  // Fetch CSRF token on page load
  fetchCsrfToken();

  // Fetch usage limits on page load
  function fetchUsageLimits() {
    fetch('/usage-limits', {
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        usageLimits = data;
        console.log('[INFO] Usage limits fetched:', usageLimits);
      })
      .catch(error => {
        console.error('[ERROR] Failed to fetch usage limits:', error);
      });
  }

  // Fetch usage limits on page load
  fetchUsageLimits();

  // Fetch usage count on page load
  updateUsageCount();

  // Function to fetch CSRF token
  function fetchCsrfToken() {
    // First check session status
    checkSessionStatus();
    
    fetch('/csrf-token', {
      credentials: 'include' // Important: include cookies with the request
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        csrfToken = data.csrfToken;
        console.log('[SECURITY] CSRF token fetched successfully');
      })
      .catch(error => {
        console.error('[SECURITY] Failed to fetch CSRF token:', error);
        // Retry after 3 seconds
        setTimeout(fetchCsrfToken, 3000);
      });
  }
  
  // Function to check session status
  function checkSessionStatus() {
    fetch('/debug-session', {
      credentials: 'include'
    })
      .then(response => response.json())
      .then(data => {
        console.log('[DEBUG] Session status:', data);
      })
      .catch(error => {
        console.error('[DEBUG] Failed to check session status:', error);
      });
  }

  // Create usage counter element
  const usageCounterContainer = document.createElement('div');
  usageCounterContainer.className = 'usage-counter text-sm text-center mx-auto mb-4';
  usageCounterContainer.id = 'usage-counter';
  usageCounterContainer.textContent = 'Loading usage information...';

  // Insert the usage counter after the input container
  const inputContainer = document.querySelector('.input-container');
  if (inputContainer && inputContainer.parentNode) {
    inputContainer.parentNode.insertBefore(usageCounterContainer, inputContainer.nextSibling);
  }

  // Function to fetch and update usage count
  function updateUsageCount() {
    console.log('[DEBUG] Fetching usage count...');
    fetch('/usage-count', {
      credentials: 'include', // Important: include cookies with the request
      cache: 'no-store' // Prevent caching of the response
    })
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
        
        console.log('[DEBUG] Usage count response:', data);
        
        const usageCounter = document.getElementById('usage-counter');
        if (usageCounter) {
          const userType = data.isLoggedIn ? 'Logged-in user' : 'Free user';
          
          // Format the text based on usage count
          let usageText = `${userType}: ${data.usageCount}/${data.maxUsageCount} uses today`;
          
          // Add remaining uses in parentheses
          if (data.remainingUses > 0) {
            usageText += ` (${data.remainingUses} remaining)`;
          } else {
            usageText += ' (0 remaining)';
          }
          
          console.log('[INFO] Updating usage counter:', data);
          
          // Set appropriate styling based on remaining uses
          if (data.remainingUses <= 0) {
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-danger';
          } else if (data.remainingUses <= 2) {
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4 text-warning';
          } else {
            usageCounter.className = 'usage-counter text-sm text-center mx-auto mb-4';
          }
          
          // Set the counter text
          usageCounter.textContent = usageText;
          
          // Force a redraw of the element
          usageCounter.style.display = 'none';
          setTimeout(() => {
            usageCounter.style.display = 'block';
          }, 10);
        } else {
          console.error('Usage counter element not found in the DOM');
        }
      })
      .catch(error => {
        console.error('Failed to fetch usage count:', error);
      });
  }

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
    const videoId = getYouTubeVideoId(url);
    
    if (!videoId) {
      alert('Please enter a valid YouTube URL');
      return;
    }
    
    // Clear previous results
    results.innerHTML = `
      <div id="thumbnail" class="mb-8 mx-auto"></div>
      <div class="text-center button-container">
        <button id="copyTranscriptionBtn" class="btn btn-secondary">
          Copy Transcript
        </button>
        <button id="downloadTxtBtn" class="btn btn-outline btn-secondary">
          Download TXT
        </button>
        <button id="downloadCsvBtn" class="btn btn-outline btn-secondary">
          Download CSV
        </button>
        <button id="summarizeBtn" class="btn btn-primary">
          Summarize
        </button>
        <button id="repurposeBtn" class="btn btn-primary">
          Repurpose
        </button>
      </div>
      <div id="aiOutput" class="my-8 w-full hidden">
        <div class="bg-gray-100 p-4 rounded-lg w-full">
          <div class="flex justify-between items-start mb-4">
            <h3 id="aiOutputTitle" class="text-xl font-bold">AI Output</h3>
            <button id="copyAiOutputBtn" class="btn btn-ghost btn-sm">
              <svg id="copyIcon" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg id="checkIcon" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
          <div id="aiOutputBadges" class="flex flex-wrap gap-2 mb-4"></div>
          <div id="aiOutputContent" class="markdown-content w-full"></div>
        </div>
      </div>
      <h2 class="text-xl font-bold mb-4 py-2 vertical-center w-full">
        Video Transcript
      </h2>
      <div class="transcript-container w-full">
        <div id="transcription" class="mb-8 w-full text-lg"></div>
      </div>
    `;
    
    // Re-assign DOM elements after recreating them
    thumbnail = document.getElementById('thumbnail');
    transcription = document.getElementById('transcription');
    copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
    downloadTxtBtn = document.getElementById('downloadTxtBtn');
    downloadCsvBtn = document.getElementById('downloadCsvBtn');
    const summarizeBtn = document.getElementById('summarizeBtn');
    const repurposeBtn = document.getElementById('repurposeBtn');
    const aiOutput = document.getElementById('aiOutput');
    const aiOutputContent = document.getElementById('aiOutputContent');
    
    // Add event listeners for the new buttons
    copyTranscriptionBtn.addEventListener('click', () => {
      const transcriptText = transcription.textContent;
      if (transcriptText) {
        navigator.clipboard.writeText(transcriptText)
          .then(() => {
            // Show a temporary success message
            const originalText = copyTranscriptionBtn.textContent;
            copyTranscriptionBtn.textContent = 'Copied!';
            copyTranscriptionBtn.classList.add('btn-success');
            
            setTimeout(() => {
              copyTranscriptionBtn.textContent = originalText;
              copyTranscriptionBtn.classList.remove('btn-success');
            }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy transcript to clipboard');
          });
      } else {
        alert('No transcript available to copy');
      }
    });
    
    downloadTxtBtn.addEventListener('click', () => {
      const filename = downloadTxtBtn.getAttribute('data-filename');
      if (filename) {
        console.log('Downloading TXT file:', filename);
        window.location.href = `/download?file=${filename}`;
      } else {
        alert('No transcript file available to download');
      }
    });
    
    downloadCsvBtn.addEventListener('click', () => {
      const filename = downloadCsvBtn.getAttribute('data-filename');
      if (filename) {
        console.log('Downloading CSV file:', filename);
        window.location.href = `/download?file=${filename}`;
      } else {
        alert('No transcript file available to download');
      }
    });
    
    // Add event listeners for Summarize and Repurpose buttons
    summarizeBtn?.addEventListener('click', () => {
      const modal = document.getElementById('summarize-modal');
      modal.checked = true;
    });

    repurposeBtn?.addEventListener('click', () => {
      const modal = document.getElementById('repurpose-modal');
      modal.checked = true;
    });
    
    // Show loading state
    buttonText.textContent = 'Transcribing...';
    transcribeBtn.disabled = true;
    
    // Show thumbnail with high-quality image
    thumbnail.innerHTML = `<img src="https://img.youtube.com/vi/${videoId}/maxresdefault.jpg" alt="Video Thumbnail" class="thumbnail-img" onerror="this.src='https://img.youtube.com/vi/${videoId}/0.jpg'">`;
    
    // Ensure we have a CSRF token
    if (!csrfToken) {
      console.log('[SECURITY] No CSRF token available, fetching one...');
      fetchCsrfToken();
      setTimeout(transcribeVideo, 1000); // Retry after 1 second
      return;
    }
    
    fetch('/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ url }),
      credentials: 'include' // Important: include cookies with the request
    })
      .then(response => {
        const status = response.status;
        return response.json().then(data => ({ data, status }));
      })
      .then(({ data, status }) => {
        console.log('Transcription data received:', data);
        
        // Reset button state
        buttonText.textContent = 'Transcribe';
        transcribeBtn.disabled = false;
        
        // Update usage count after successful transcription
        console.log('[DEBUG] Updating usage count after transcription');
        updateUsageCount();
        
        if (data.error) {
          console.error('Error from server:', data.error);
          
          // Check if it's a rate limit error (HTTP 429)
          if (status === 429) {
            // Create a more user-friendly rate limit message
            const errorContainer = document.createElement('div');
            errorContainer.className = 'alert alert-error shadow-lg mb-4 rate-limit-banner';
            errorContainer.innerHTML = `
              <div class="content">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <h3 class="font-bold">Rate Limit Reached</h3>
                  <div class="text-xs">Daily maximum of ${usageLimits.freeUserLimit} uses for free accounts. Please sign up for more uses (${usageLimits.loggedInUserLimit} per day).</div>
                </div>
              </div>
              ${!window.Clerk?.user ? '<div class="sign-in-button"><button id="signInBtn" class="btn btn-sm btn-primary">SIGN IN FOR MORE USES</button></div>' : ''}
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
          } else {
            // For other errors, show a simple error message
            results.innerHTML = `<div class="alert alert-error shadow-lg mb-4">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>${data.error}</span>
              </div>
            </div>`;
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
    console.log(`Selected language: ${languageCode} for video ID: ${videoId}`);
    
    // Ensure we have a CSRF token
    if (!csrfToken) {
      console.log('[SECURITY] No CSRF token available for language selection, fetching one...');
      await new Promise(resolve => {
        fetchCsrfToken();
        setTimeout(resolve, 1000);
      });
      
      // If still no token, alert the user
      if (!csrfToken) {
        alert('Could not secure a connection. Please refresh the page and try again.');
        return;
      }
    }
    
    // Hide the modal
    hideModal();
    
    // Show loading state
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'loading-message';
    loadingMessage.innerHTML = `
      <div class="flex items-center justify-center my-4">
        <span class="loading loading-spinner loading-md mr-2"></span>
        <span>Loading transcript...</span>
      </div>
    `;
    transcription.innerHTML = '';
    transcription.appendChild(loadingMessage);
    
    try {
      const response = await fetch(`/transcribe/${videoId}/${languageCode}`, {
        method: 'GET',
        headers: {
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include'
      });
      
      // Check for rate limiting or other errors
      if (response.status === 429) {
        const errorData = await response.json();
        // Create a more user-friendly rate limit message
        const errorContainer = document.createElement('div');
        errorContainer.className = 'alert alert-error shadow-lg mb-4 rate-limit-banner';
        errorContainer.innerHTML = `
          <div class="content">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <h3 class="font-bold">Rate Limit Reached</h3>
              <div class="text-xs">Daily maximum of ${usageLimits.freeUserLimit} uses for free accounts. Please sign up for more uses (${usageLimits.loggedInUserLimit} per day).</div>
            </div>
          </div>
          ${!window.Clerk?.user ? '<div class="sign-in-button"><button id="signInBtn" class="btn btn-sm btn-primary">SIGN IN FOR MORE USES</button></div>' : ''}
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
        
        transcription.innerHTML = '';
        return;
      } else if (response.status === 403) {
        // Security error - refresh the CSRF token
        fetchCsrfToken();
        alert('Security error. Please try again.');
        transcription.innerHTML = '';
        return;
      } else if (!response.ok) {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to fetch transcript'}`);
        transcription.innerHTML = '';
        return;
      }
      
      const data = await response.json();
      console.log('Transcript data received:', data);
      
      // Update usage count after successful transcription
      updateUsageCount();
      
      if (data.error) {
        alert(`Error: ${data.error}`);
        transcription.innerHTML = '';
        return;
      }
      
      if (data.savedTranscripts && data.savedTranscripts.length > 0) {
        const transcript = data.savedTranscripts[0];
        
        // Make results visible
        results.classList.remove('hidden');
        
        // Display the transcript
        displayTranscription(transcript);
      } else {
        alert('No transcript found for the selected language.');
        transcription.innerHTML = '';
      }
    } catch (error) {
      console.error('Error fetching transcript:', error);
      alert('An error occurred while fetching the transcript. Please try again.');
      transcription.innerHTML = '';
    }
  }

  function displayTranscription(savedTranscript) {
    // Clear any loading indicators
    transcription.innerHTML = '';
    
    // Set the transcript text
    transcription.textContent = savedTranscript.subtitlesText;
    
    // Make sure the results container is visible
    results.classList.remove('hidden');
    
    // Make sure the transcription container has content and is visible
    if (transcription.textContent.trim() === '') {
      console.error('Transcript text is empty!');
      transcription.innerHTML = '<p class="text-red-500">Error: Transcript text is empty. Please try again.</p>';
    } else {
      console.log('Transcript text length:', transcription.textContent.length);
    }
    
    // Force the transcript container to be visible with inline style
    transcription.style.display = 'block';
    
    // Enable download buttons with the correct filenames
    downloadTxtBtn.setAttribute('data-filename', savedTranscript.txtFilename);
    downloadCsvBtn.setAttribute('data-filename', savedTranscript.csvFilename);
    
    // Enable all buttons
    downloadTxtBtn.disabled = false;
    downloadCsvBtn.disabled = false;
    copyTranscriptionBtn.disabled = false;
    
    console.log('Transcript displayed successfully:', savedTranscript.txtFilename);
  }

  transcribeBtn.addEventListener('click', transcribeVideo);

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
    if (!window.Clerk) {
      alert('Authentication system is not ready. Please refresh the page and try again.');
      return;
    }
    
    // Check if the publishable key is missing
    if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
      window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
    }
    
    // Open the sign-in modal
    try {
      window.Clerk.openSignIn({
        redirectUrl: window.location.href,
        appearance: {
          elements: {
            rootBox: {
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px'
            }
          }
        }
      });
    } catch (error) {
      alert('There was an error opening the sign-in modal. Please try again.');
    }
  }
  
  // Function to handle sign-up
  function handleSignUp(e) {
    e.preventDefault();
    
    // Check if Clerk is initialized
    if (!window.Clerk) {
      alert('Authentication system is not ready. Please refresh the page and try again.');
      return;
    }
    
    // Check if the publishable key is missing
    if (!window.Clerk.publishableKey && window.CLERK_PUBLISHABLE_KEY) {
      window.Clerk.publishableKey = window.CLERK_PUBLISHABLE_KEY;
    }
    
    // Open the sign-up modal
    try {
      window.Clerk.openSignUp({
        redirectUrl: window.location.href,
        appearance: {
          elements: {
            rootBox: {
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px'
            }
          }
        }
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
    // First enable buttons if they were disabled
    enableAuthButtons();
    
    // Buttons for larger screens
    const signInButton = document.getElementById('sign-in-button');
    const signUpButton = document.getElementById('sign-up-button');
    
    if (signInButton) {
      // Remove any existing listeners to prevent duplicates
      const newSignInButton = signInButton.cloneNode(true);
      signInButton.parentNode.replaceChild(newSignInButton, signInButton);
      
      // Add click handler to the new button
      newSignInButton.addEventListener('click', handleSignIn);
    }
    
    if (signUpButton) {
      // Remove any existing listeners to prevent duplicates
      const newSignUpButton = signUpButton.cloneNode(true);
      signUpButton.parentNode.replaceChild(newSignUpButton, signUpButton);
      
      // Add click handler to the new button
      newSignUpButton.addEventListener('click', handleSignUp);
    }

    // Buttons for smaller screens (dropdown)
    const dropdownSignInButton = document.getElementById('dropdown-sign-in-button');
    const dropdownSignUpButton = document.getElementById('dropdown-sign-up-button');
    
    if (dropdownSignInButton) {
      // Remove any existing listeners to prevent duplicates
      const newDropdownSignInButton = dropdownSignInButton.cloneNode(true);
      dropdownSignInButton.parentNode.replaceChild(newDropdownSignInButton, dropdownSignInButton);
      
      // Add click handler to the new button
      newDropdownSignInButton.addEventListener('click', handleSignIn);
    }
    
    if (dropdownSignUpButton) {
      // Remove any existing listeners to prevent duplicates
      const newDropdownSignUpButton = dropdownSignUpButton.cloneNode(true);
      dropdownSignUpButton.parentNode.replaceChild(newDropdownSignUpButton, dropdownSignUpButton);
      
      // Add click handler to the new button
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
    // Update avatar images if user is logged in
    if (user) {
      const userAvatarImg = document.getElementById('userAvatarImg');
      const userAvatarImgSmall = document.getElementById('userAvatarImgSmall');
      
      // Set avatar images
      if (user.imageUrl) {
        if (userAvatarImg) userAvatarImg.src = user.imageUrl;
        if (userAvatarImgSmall) userAvatarImgSmall.src = user.imageUrl;
      } else {
        const defaultImage = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
        if (userAvatarImg) userAvatarImg.src = defaultImage;
        if (userAvatarImgSmall) userAvatarImgSmall.src = defaultImage;
      }
      
      // Set up necessary buttons
      setupSignOutButtons();
      setupProfileButtons();
    } else {
      // User is logged out, set up auth buttons
      setupAuthButtons();
    }
    
    // Apply visibility changes to update the UI
    applyResponsiveVisibility();
  }
  
  // Function to apply responsive visibility based on screen size
  function applyResponsiveVisibility() {
    // Get viewport width once
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth <= 640;
    
    // Get auth state
    const isClerkAvailable = window.Clerk !== undefined;
    const isUserLoggedIn = isClerkAvailable && window.Clerk.user;
    
    // Get all relevant elements
    const mobileContainer = document.querySelector('.navbar-end.sm\\:hidden');
    const desktopContainer = document.querySelector('.navbar-end.hidden.sm\\:flex');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const userAvatarDropdown = document.getElementById('userAvatarDropdown');
    const userButtons = document.getElementById('userButtons');
    const userAvatar = document.getElementById('userAvatar');
    
    // REQUIREMENTS:
    // 1. Small Screen (Mobile/Tablet)
    //    - Logged Out: Show ONLY hamburger menu with Sign In/Sign Up dropdown
    //    - Logged In: Show ONLY profile picture dropdown with Profile/Logout
    // 2. Desktop (Larger Screens)
    //    - Logged Out: Show ONLY Sign In and Sign Up buttons
    //    - Logged In: Show ONLY profile picture dropdown with Profile/Logout
    
    // Reset all visibility first
    if (mobileContainer) mobileContainer.style.display = 'none';
    if (desktopContainer) desktopContainer.style.display = 'none';
    if (hamburgerMenu) hamburgerMenu.style.display = 'none';
    if (userAvatarDropdown) userAvatarDropdown.style.display = 'none';
    if (userButtons) userButtons.style.display = 'none';
    if (userAvatar) userAvatar.style.display = 'none';
    
    // MOBILE BEHAVIOR (width <= 640px)
    if (isMobile) {
      if (mobileContainer) mobileContainer.style.display = 'flex';
      
      if (isUserLoggedIn) {
        // Logged In on Mobile: Show ONLY profile picture dropdown
        if (userAvatarDropdown) userAvatarDropdown.style.display = 'block';
      } else {
        // Logged Out on Mobile: Show ONLY hamburger menu
        if (hamburgerMenu) hamburgerMenu.style.display = 'block';
      }
    } 
    // DESKTOP BEHAVIOR (width > 640px)
    else {
      if (desktopContainer) desktopContainer.style.display = 'flex';
      
      if (isUserLoggedIn) {
        // Logged In on Desktop: Show ONLY profile picture
        if (userAvatar) userAvatar.style.display = 'block';
      } else {
        // Logged Out on Desktop: Show ONLY sign-in/sign-up buttons
        if (userButtons) userButtons.style.display = 'flex';
      }
    }
  }
  
  // A more robust throttle function with debounce capability
  function throttleAndDebounce(func, delay) {
    let lastCall = 0;
    let timeout = null;
    
    return function(...args) {
      // Clear any existing timeout
      if (timeout) {
        clearTimeout(timeout);
      }
      
      // Set a timeout to ensure the function runs at least once after user stops resizing
      timeout = setTimeout(() => {
        func.apply(this, args);
      }, delay);
      
      // Check if we should run the function now (throttle part)
      const now = new Date().getTime();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }

  // Add resize event listener with improved timing control
  window.addEventListener('resize', throttleAndDebounce(() => {
    // Don't log every resize event to reduce console spam
    applyResponsiveVisibility();
  }, 250)); // Increased delay to reduce frequency

  function setupClerkListeners() {
    if (!window.Clerk) {
      console.log("Clerk not available yet, cannot set up listeners");
      return;
    }
    
    try {
      console.log("Setting up Clerk listeners");
      
      // Set up sign-out buttons
      setupSignOutButtons();
      
      // Set up auth buttons for both mobile and desktop
      setupAuthButtons();
      
      // Set up profile buttons for profile navigation
      setupProfileButtons();
      
      // Listen for auth state changes
      window.Clerk.addListener(({ user }) => {
        console.log("Auth state changed:", user ? "User logged in" : "User logged out");
        
        if (user) {
          // User logged in, update avatar and setup related buttons
          const userAvatarImg = document.getElementById('userAvatarImg');
          const userAvatarImgSmall = document.getElementById('userAvatarImgSmall');
          
          if (user.imageUrl) {
            if (userAvatarImg) userAvatarImg.src = user.imageUrl;
            if (userAvatarImgSmall) userAvatarImgSmall.src = user.imageUrl;
          } else {
            const defaultImage = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
            if (userAvatarImg) userAvatarImg.src = defaultImage;
            if (userAvatarImgSmall) userAvatarImgSmall.src = defaultImage;
          }
          
          setupSignOutButtons();
          setupProfileButtons();
        } else {
          // User logged out, set up auth buttons
          setupAuthButtons();
        }
        
        // Apply visibility changes with a small delay to ensure DOM is updated
        setTimeout(() => {
          applyResponsiveVisibility();
        }, 10);
      });
      
      // Check current user state and initialize UI accordingly
      if (window.Clerk.user) {
        console.log("User is already logged in on page load");
        updateUIForAuthState(window.Clerk.user);
      } else {
        console.log("No user logged in on page load");
        updateUIForAuthState(null);
      }
      
      // Ensure final UI state is consistent
      setTimeout(() => {
        applyResponsiveVisibility();
      }, 50);
    } catch (error) {
      console.error("Error setting up Clerk listeners:", error);
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

  // Add a debug button in development mode
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const debugButtonsContainer = document.createElement('div');
    debugButtonsContainer.className = 'debug-buttons flex gap-2 justify-center mt-2 mb-4';
    
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Debug Session';
    debugButton.className = 'btn btn-sm btn-outline btn-warning';
    debugButton.addEventListener('click', () => {
      checkSessionStatus();
      alert('Session status checked. See console for details.');
    });
    
    const resetLimitsButton = document.createElement('button');
    resetLimitsButton.textContent = 'Reset Limits';
    resetLimitsButton.className = 'btn btn-sm btn-outline btn-error';
    resetLimitsButton.addEventListener('click', () => {
      resetUsageLimits();
    });
    
    debugButtonsContainer.appendChild(debugButton);
    debugButtonsContainer.appendChild(resetLimitsButton);
    
    // Add it after the usage counter
    const usageCounter = document.getElementById('usage-counter');
    if (usageCounter && usageCounter.parentNode) {
      usageCounter.parentNode.insertBefore(debugButtonsContainer, usageCounter.nextSibling);
    }
  }

  // Function to reset usage limits (for development only)
  function resetUsageLimits() {
    fetch('/reset-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('[DEBUG] Usage limits reset:', data);
        alert('Usage limits have been reset. New count: ' + data.usageCount);
        // Update the usage counter
        updateUsageCount();
      })
      .catch(error => {
        console.error('[ERROR] Failed to reset usage limits:', error);
        alert('Failed to reset usage limits: ' + error.message);
      });
  }

  // Add the enableDownloadButtons function if it doesn't exist
  function enableDownloadButtons(txtFilename, csvFilename) {
    console.log('Enabling download buttons with files:', txtFilename, csvFilename);
    
    // Set the filenames as data attributes
    downloadTxtBtn.setAttribute('data-filename', txtFilename);
    downloadCsvBtn.setAttribute('data-filename', csvFilename);
    
    // Make the buttons visible and enabled
    downloadTxtBtn.disabled = false;
    downloadCsvBtn.disabled = false;
    copyTranscriptionBtn.disabled = false;
    
    // Make sure the results container is visible
    results.classList.remove('hidden');
  }

  // Initialize modals
  const summarizeModal = document.getElementById('summarize-modal');
  const repurposeModal = document.getElementById('repurpose-modal');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const repurposeBtn = document.getElementById('repurposeBtn');
  const generateSummaryBtn = document.getElementById('generateSummaryBtn');
  const generateRepurposeBtn = document.getElementById('generateRepurposeBtn');
  const aiOutput = document.getElementById('aiOutput');
  const aiOutputContent = document.getElementById('aiOutputContent');

  // Add event listeners for modal close buttons
  document.querySelectorAll('dialog .btn-circle').forEach(button => {
    button.addEventListener('click', () => {
      button.closest('dialog').close();
    });
  });

  // Add click event listeners for modal backdrops
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        dialog.close();
      }
    });
  });

  // Function to get CSRF token
  async function getCsrfToken() {
    if (!csrfToken) {
      try {
        const response = await fetch('/csrf-token', {
          credentials: 'include'
        });
        const data = await response.json();
        csrfToken = data.csrfToken;
      } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
      }
    }
    return csrfToken;
  }

  // Variable to store the interval ID for message rotation
  let messageRotationInterval;

  // Array of loading messages
  const loadingMessages = [
    "Brewing some content magic ✨... almost there!",
    "Hold on! We're sprinkling the word wizardry 🧙‍♂️.",
    "Rephrasing the awesomeness... stay tuned 👍.",
    "Content remix in progress 🎧... just a moment!",
    "Summoning the wordsmith bots 🤖... standby!",
    "Loading your fresh-baked content cookies 🍪...",
    "Spinning the content gears ⚙️ – nearly done!",
    "Feeding ideas to the creative machine 🚀... hang tight!",
    "Polishing the best bits ✨... your content's coming soon!",
    "Turning content coal into content diamonds 💎... just a sec!"
  ];

  function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    const messageElement = document.getElementById('loadingMessage');
    
    if (overlay) {
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // Prevent scrolling
      
      // Set initial message
      if (messageElement) {
        messageElement.textContent = loadingMessages[0];
      }
      
      // Start rotating messages every 2 seconds
      let currentIndex = 1; // Start with the second message on first rotation
      
      // Clear any existing interval
      if (messageRotationInterval) {
        clearInterval(messageRotationInterval);
      }
      
      messageRotationInterval = setInterval(() => {
        if (messageElement) {
          // Add fade-out class
          messageElement.classList.add('fade-out');
          
          // After a short delay, change the text and remove the fade-out class
          setTimeout(() => {
            messageElement.textContent = loadingMessages[currentIndex];
            messageElement.classList.remove('fade-out');
            
            // Increment index and loop back to 0 if we reach the end
            currentIndex = (currentIndex + 1) % loadingMessages.length;
          }, 300);
        }
      }, 2000); // Rotate every 2 seconds
    }
  }
  
  // Function to hide the loading overlay
  function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      document.body.style.overflow = ''; // Restore scrolling
      
      // Clear the message rotation interval
      if (messageRotationInterval) {
        clearInterval(messageRotationInterval);
        messageRotationInterval = null;
      }
    }
  }

  document.getElementById('generateSummaryBtn')?.addEventListener('click', async () => {
    const generateBtn = document.getElementById('generateSummaryBtn');
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    
    // Show the loading overlay
    showLoadingOverlay();

    try {
      const transcriptText = document.getElementById('transcription').textContent;
      const length = document.getElementById('summaryLength').value;
      const focus = document.getElementById('summaryFocus').value;

      const response = await fetch('/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrfToken()
        },
        body: JSON.stringify({
          transcript: transcriptText,
          length: length,
          focus: focus
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      
      // Get the aiOutput element and make it visible
      const aiOutput = document.getElementById('aiOutput');
      if (aiOutput) {
        aiOutput.classList.remove('hidden');
      }
      
      // Set title to "AI Summary"
      const aiOutputTitle = document.getElementById('aiOutputTitle');
      if (aiOutputTitle) {
        aiOutputTitle.textContent = 'AI Summary';
      }
      
      // Create badges for summary options
      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap gap-2 mb-2';
      
      // Add type badge
      const typeBadge = document.createElement('div');
      typeBadge.className = 'badge badge-primary';
      typeBadge.textContent = 'Summary';
      badges.appendChild(typeBadge);
      
      // Add length badge
      const lengthSelect = document.getElementById('summaryLength');
      if (lengthSelect) {
        const lengthBadge = document.createElement('div');
        lengthBadge.className = 'badge';
        lengthBadge.textContent = `Length: ${lengthSelect.value}`;
        badges.appendChild(lengthBadge);
      }
      
      // Add focus badge
      const focusSelect = document.getElementById('summaryFocus');
      if (focusSelect) {
        const focusBadge = document.createElement('div');
        focusBadge.className = 'badge';
        focusBadge.textContent = `Focus: ${focusSelect.value}`;
        badges.appendChild(focusBadge);
      }
      
      // Get the aiOutputContent element
      const aiOutputContent = document.getElementById('aiOutputContent');
      
      // Clear any existing badges
      const existingBadges = document.querySelector('#aiOutput .flex.flex-wrap.gap-2');
      if (existingBadges) {
        existingBadges.remove();
      }
      
      // Add badges before content - make sure we're inserting in the right place
      if (aiOutputContent && aiOutputContent.parentNode) {
        aiOutputContent.parentNode.insertBefore(badges, aiOutputContent);
      }
      
      // Set the content with markdown preserved for copying
      if (aiOutputContent) {
        // Store the original markdown for copying
        aiOutputContent.setAttribute('data-markdown', data.output);
        // Render the markdown as HTML
        aiOutputContent.innerHTML = marked.parse(data.output);
      }
      
      // Reinitialize the copy button after content is set
      const copyAiOutputBtn = document.getElementById('copyAiOutputBtn');
      if (copyAiOutputBtn) {
        // Remove any existing event listeners by cloning and replacing
        const newCopyBtn = copyAiOutputBtn.cloneNode(true);
        copyAiOutputBtn.parentNode.replaceChild(newCopyBtn, copyAiOutputBtn);
        
        // Add the click event listener to the new button
        newCopyBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Copy AI Output button clicked');
          
          const aiOutputContent = document.getElementById('aiOutputContent');
          const copyIcon = document.getElementById('copyIcon');
          const checkIcon = document.getElementById('checkIcon');
          
          if (aiOutputContent) {
            try {
              const dataMarkdown = aiOutputContent.getAttribute('data-markdown');
              const contentToCopy = dataMarkdown || aiOutputContent.textContent;
              
              console.log('Content to copy (first 50 chars):', contentToCopy.substring(0, 50));
              
              await navigator.clipboard.writeText(contentToCopy);
              
              console.log('Content copied to clipboard successfully');
              
              if (copyIcon && checkIcon) {
                copyIcon.classList.add('hidden');
                checkIcon.classList.remove('hidden');
                
                setTimeout(() => {
                  copyIcon.classList.remove('hidden');
                  checkIcon.classList.add('hidden');
                }, 2000);
              }
            } catch (err) {
              console.error('Failed to copy text:', err);
              alert('Failed to copy content to clipboard');
            }
          } else {
            console.warn('AI output content element not found');
          }
        });
        
        console.log('Copy AI Output button event listener attached after summary generation');
      }
      
      // Close the modal
      const modal = document.getElementById('summarize-modal');
      if (modal) {
        modal.checked = false;
      }
      
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      // Re-enable the button and remove loading state
      generateBtn.disabled = false;
      generateBtn.classList.remove('loading');
      
      // Hide the loading overlay
      hideLoadingOverlay();
    }
  });

  document.getElementById('generateRepurposeBtn')?.addEventListener('click', async () => {
    const generateBtn = document.getElementById('generateRepurposeBtn');
    generateBtn.disabled = true;
    generateBtn.classList.add('loading');
    
    // Show the loading overlay
    showLoadingOverlay();

    try {
      const transcriptText = document.getElementById('transcription').textContent;
      const purpose = document.getElementById('repurposePurpose').value;
      const tone = document.getElementById('repurposeTone').value;

      const response = await fetch('/generate-repurpose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrfToken()
        },
        body: JSON.stringify({
          transcript: transcriptText,
          purpose: purpose,
          tone: tone
        })
      });

      if (!response.ok) {
        throw new Error('Failed to repurpose content');
      }

      const data = await response.json();
      
      // Get the aiOutput element and make it visible
      const aiOutput = document.getElementById('aiOutput');
      if (aiOutput) {
        aiOutput.classList.remove('hidden');
      }
      
      // Set title to "AI Repurpose"
      const aiOutputTitle = document.getElementById('aiOutputTitle');
      if (aiOutputTitle) {
        aiOutputTitle.textContent = 'AI Repurpose';
      }
      
      // Create badges for repurpose options
      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap gap-2 mb-2';
      
      // Add type badge
      const typeBadge = document.createElement('div');
      typeBadge.className = 'badge badge-primary';
      typeBadge.textContent = 'Repurpose';
      badges.appendChild(typeBadge);
      
      // Add purpose badge
      const purposeSelect = document.getElementById('repurposePurpose');
      if (purposeSelect) {
        const purposeBadge = document.createElement('div');
        purposeBadge.className = 'badge';
        purposeBadge.textContent = `Purpose: ${purposeSelect.value}`;
        badges.appendChild(purposeBadge);
      }
      
      // Add tone badge
      const toneSelect = document.getElementById('repurposeTone');
      if (toneSelect) {
        const toneBadge = document.createElement('div');
        toneBadge.className = 'badge';
        toneBadge.textContent = `Tone: ${toneSelect.value}`;
        badges.appendChild(toneBadge);
      }
      
      // Get the aiOutputContent element
      const aiOutputContent = document.getElementById('aiOutputContent');
      
      // Clear any existing badges
      const existingBadges = document.querySelector('#aiOutput .flex.flex-wrap.gap-2');
      if (existingBadges) {
        existingBadges.remove();
      }
      
      // Add badges before content - make sure we're inserting in the right place
      if (aiOutputContent && aiOutputContent.parentNode) {
        aiOutputContent.parentNode.insertBefore(badges, aiOutputContent);
      }
      
      // Set the content with markdown preserved for copying
      if (aiOutputContent) {
        // Store the original markdown for copying
        aiOutputContent.setAttribute('data-markdown', data.output);
        // Render the markdown as HTML
        aiOutputContent.innerHTML = marked.parse(data.output);
      }
      
      // Reinitialize the copy button after content is set
      const copyAiOutputBtn = document.getElementById('copyAiOutputBtn');
      if (copyAiOutputBtn) {
        // Remove any existing event listeners by cloning and replacing
        const newCopyBtn = copyAiOutputBtn.cloneNode(true);
        copyAiOutputBtn.parentNode.replaceChild(newCopyBtn, copyAiOutputBtn);
        
        // Add the click event listener to the new button
        newCopyBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Copy AI Output button clicked');
          
          const aiOutputContent = document.getElementById('aiOutputContent');
          const copyIcon = document.getElementById('copyIcon');
          const checkIcon = document.getElementById('checkIcon');
          
          if (aiOutputContent) {
            try {
              const dataMarkdown = aiOutputContent.getAttribute('data-markdown');
              const contentToCopy = dataMarkdown || aiOutputContent.textContent;
              
              console.log('Content to copy (first 50 chars):', contentToCopy.substring(0, 50));
              
              await navigator.clipboard.writeText(contentToCopy);
              
              console.log('Content copied to clipboard successfully');
              
              if (copyIcon && checkIcon) {
                copyIcon.classList.add('hidden');
                checkIcon.classList.remove('hidden');
                
                setTimeout(() => {
                  copyIcon.classList.remove('hidden');
                  checkIcon.classList.add('hidden');
                }, 2000);
              }
            } catch (err) {
              console.error('Failed to copy text:', err);
              alert('Failed to copy content to clipboard');
            }
          } else {
            console.warn('AI output content element not found');
          }
        });
        
        console.log('Copy AI Output button event listener attached after repurpose generation');
      }
      
      // Close the modal
      const modal = document.getElementById('repurpose-modal');
      if (modal) {
        modal.checked = false;
      }
      
    } catch (error) {
      console.error('Error repurposing content:', error);
      alert('Failed to repurpose content. Please try again.');
    } finally {
      // Re-enable the button and remove loading state
      generateBtn.disabled = false;
      generateBtn.classList.remove('loading');
      
      // Hide the loading overlay
      hideLoadingOverlay();
    }
  });

  // Add copy button functionality - moving earlier in initialization
  function setupCopyAiOutputButton() {
    const copyButton = document.getElementById('copyAiOutputBtn');
    if (copyButton) {
      // First, remove all existing event listeners
      const newCopyBtn = copyButton.cloneNode(true);
      copyButton.parentNode.replaceChild(newCopyBtn, copyButton);
      
      // Add a direct click handler
      document.getElementById('copyAiOutputBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Copy button clicked directly');
        
        // Get the elements
        const aiOutputContent = document.getElementById('aiOutputContent');
        const copyIcon = document.getElementById('copyIcon');
        const checkIcon = document.getElementById('checkIcon');
        
        if (!aiOutputContent) {
          console.error('AI output content not found');
          return;
        }
        
        try {
          // Get the markdown content from the data attribute if available
          const markdownContent = aiOutputContent.getAttribute('data-markdown');
          let contentToCopy;
          
          if (markdownContent) {
            contentToCopy = markdownContent;
            console.log('Using markdown content from data attribute');
          } else {
            contentToCopy = aiOutputContent.textContent;
            console.log('Using text content as fallback');
          }
          
          console.log('Content to copy (first 50 chars):', contentToCopy.substring(0, 50));
          
          // Copy to clipboard
          await navigator.clipboard.writeText(contentToCopy);
          console.log('Content copied successfully');
          
          // Show success indicator
          if (copyIcon && checkIcon) {
            copyIcon.classList.add('hidden');
            checkIcon.classList.remove('hidden');
            
            // Reset after 2 seconds
            setTimeout(() => {
              copyIcon.classList.remove('hidden');
              checkIcon.classList.add('hidden');
            }, 2000);
          }
        } catch (err) {
          console.error('Failed to copy content:', err);
          alert('Failed to copy content: ' + err.message);
        }
      });
      
      console.log('Direct copy button event listener attached');
    } else {
      console.warn('Copy AI Output button not found in the DOM');
    }
  }

  // Set up copy button initially
  setupCopyAiOutputButton();
});