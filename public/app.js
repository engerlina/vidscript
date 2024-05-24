document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const results = document.getElementById('results');
    const thumbnail = document.getElementById('thumbnail');
    const transcription = document.getElementById('transcription');
    const copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
    const downloadTxtBtn = document.getElementById('downloadTxtBtn');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  
    const getYouTubeVideoId = (url) => {
      const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const matches = url.match(regex);
      console.log(`URL matches: ${matches}`);
      return matches ? matches[1] : null;
    };
  
    transcribeBtn.addEventListener('click', async () => {
      const url = urlInput.value;
      console.log(`URL input: ${url}`);
      const videoId = getYouTubeVideoId(url);
      console.log(`Extracted video ID: ${videoId}`);
  
      if (!videoId) {
        alert('Invalid YouTube URL');
        return;
      }
  
      try {
        const response = await fetch('/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url })
        });
        console.log(`Transcribe response status: ${response.status}`);
        const data = await response.json();
        console.log('Transcription data received:', data);
  
        if (data.error) {
          console.error('Error from server:', data.error);
          alert('Error: ' + data.error);
          return;
        }
  
        thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        transcription.textContent = data.transcript.map(entry => entry.text).join('\n');
        results.classList.remove('hidden');
  
        // Update the download buttons with the generated filenames
        downloadTxtBtn.setAttribute('data-filename', data.txtFilename);
        downloadCsvBtn.setAttribute('data-filename', data.csvFilename);
      } catch (error) {
        console.error('An error occurred while fetching the transcription:', error);
        alert('An error occurred while fetching the transcription');
      }
    });
  
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
  });