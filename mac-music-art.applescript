on run argv
  set destination to POSIX file (item 1 of argv)
  set outputFile to missing value
  try
    tell application id "com.apple.Music"
      if not running then return "false"
      set pictureData to raw data of artwork 1 of current track
    end tell
    set outputFile to open for access destination with write permission
    set eof outputFile to 0
    write pictureData to outputFile
    close access outputFile
    return "true"
  on error
    if outputFile is not missing value then
      try
        close access outputFile
      end try
    end if
    return "false"
  end try
end run
