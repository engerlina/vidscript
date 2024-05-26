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

  // Clerk initialization
  const frontendApi = 'pk_live_Y2xlcmsudmlkc2NyaXB0LmNvJA';

  console.log('Loading Clerk with frontend API:', frontendApi);

  const script = document.createElement('script');
  script.setAttribute('data-clerk-publishable-key', frontendApi);
  script.async = true;
  script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
  script.crossOrigin = 'anonymous';
  script.addEventListener('load', () => {
    console.log('Clerk loaded successfully');

    const userButtons = document.getElementById('userButtons');
    const userAvatar = document.getElementById('userAvatar');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const signOutButton = document.getElementById('sign-out-button');
    const profileLink = document.getElementById('profile-link');

    if (profileLink) {
      profileLink.addEventListener('click', () => {
        window.Clerk.openUserProfile();
      });
    }

    // Check if the user is signed in
    window.Clerk.load({
      publishableKey: frontendApi
    }).then(() => {
      console.log('Clerk components ready');

      window.Clerk.addListener(({ user }) => {
        if (user) {
          // User is signed in
          userButtons.style.display = 'none';
          userAvatar.style.display = 'block';

          // Set the user's profile image URL
          userAvatarImg.src = user.imageUrl;

          signOutButton.addEventListener('click', () => {
            window.Clerk.signOut().then(() => {
              location.reload();
            });
          });
        } else {
          // User is not signed in
          userButtons.style.display = 'block';
          userAvatar.style.display = 'none';
        }
      });

      const signInButton = document.getElementById('sign-in-button');
      const signUpButton = document.getElementById('sign-up-button');

      console.log('Sign-in button:', signInButton);
      console.log('Sign-up button:', signUpButton);

      if (signInButton) {
        signInButton.addEventListener('click', () => {
          console.log('Sign-in button clicked');
          window.Clerk.openSignIn();
        });
      } else {
        console.warn('Sign-in button not found');
      }

      if (signUpButton) {
        signUpButton.addEventListener('click', () => {
          console.log('Sign-up button clicked');
          window.Clerk.openSignUp();
        });
      } else {
        console.warn('Sign-up button not found');
      }
    }).catch((err) => {
      console.error('Error loading Clerk components:', err);
    });
  });
  document.head.appendChild(script);
});
