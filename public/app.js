document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const results = document.getElementById('results');
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
      transcription.textContent = data.transcript.map(entry => entry.text).join('\n');
      results.classList.remove('hidden');
    });
  
    downloadTxtBtn.addEventListener('click', () => {
      window.location.href = '/download-txt';
    });
  
    downloadCsvBtn.addEventListener('click', () => {
      window.location.href = '/download-csv';
    });
  });