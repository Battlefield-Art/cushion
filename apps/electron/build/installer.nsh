; "Open in Cushion" context menu for Windows Explorer
; Adds/removes a right-click option on folders

!macro customInstall
  ; Add "Open in Cushion" to folder context menu
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInCushion" "" "Open in Cushion"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInCushion" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInCushion\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Also add to directory background (right-click empty space in folder)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInCushion" "" "Open in Cushion"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInCushion" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInCushion\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  ; Remove context menu entries on uninstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInCushion"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInCushion"

!macroend
