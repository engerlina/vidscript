document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const results = document.getElementById('results');
    const thumbnail = document.getElementById('thumbnail');
    const transcription = document.getElementById('transcription');
    const downloadTxtBtn = document.getElementById('downloadTxtBtn');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  
    transcribeBtn.addEventListener('click', async () => {
        const url = urlInput.value;
        const response = await fetch('/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url })
        });
        const data = await response.json();
        thumbnail.src = `https://img.youtube.com/vi/${url.split('v=')[1]}/maxresdefault.jpg`;
        videoTitle.textContent = data.title; // Set the video title
        transcription.textContent = data.transcript.map(entry => entry.text).join('\n');
        results.classList.remove('hidden');
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
      const response = await fetch('/download-txt');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcript.txt';
      a.click();
    });
  
    downloadCsvBtn.addEventListener('click', async () => {
      const response = await fetch('/download-csv');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcript.csv';
      a.click();
    });
  });