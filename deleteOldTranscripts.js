const fs = require('fs');
const path = require('path');

const TRANSCRIPTS_FOLDER = 'transcripts';
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // in milliseconds

function deleteOldTranscripts() {
  const currentTime = Date.now();

  fs.readdir(TRANSCRIPTS_FOLDER, (err, files) => {
    if (err) {
      console.error('Error reading transcripts folder:', err);
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(TRANSCRIPTS_FOLDER, file);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error getting file stats:', err);
          return;
        }

        const fileAge = currentTime - stats.mtime.getTime();

        if (fileAge > TWENTY_FOUR_HOURS) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error('Error deleting file:', err);
            } else {
              console.log('Deleted file:', filePath);
            }
          });
        }
      });
    });
  });
}

deleteOldTranscripts();