; Retain electron-builder's installation, elevation and uninstall handling.
!define MUI_BGCOLOR "171C28"
!define MUI_TEXTCOLOR "E7EDF7"
!define MUI_INSTFILESPAGE_COLORS "E7EDF7 171C28"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_INSTFILESPAGE_HEADER_TEXT "Making room for your music"
!define MUI_INSTFILESPAGE_HEADER_SUBTEXT "Setting up Visualiser Studio. Just a moment."
!define MUI_CUSTOMFUNCTION_GUIINIT StudioGuiInit

!macro customHeader
  BrandingText "See your sound."
  Function StudioGuiInit
    SetCtlColors $HWNDPARENT "E7EDF7" "171C28"
    GetDlgItem $0 $HWNDPARENT 1028
    SetCtlColors $0 "A7B1C8" "171C28"
  FunctionEnd
!macroend

!macro customInit
  ; Older clients request an interactive update: skip setup for those too.
  ${If} ${isUpdated}
    SetSilent silent
  ${EndIf}
!macroend

!macro customInstallMode
  ; Keep an existing machine installation's scope; new installs use this user.
  ${If} $hasPerMachineInstallation == "1"
    StrCpy $isForceMachineInstall "1"
  ${Else}
    StrCpy $isForceCurrentInstall "1"
  ${EndIf}
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Let's get you set up"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Your music. Your colours. Your space.$\r$\n$\r$\nVisualiser Studio turns sound into something you can shape, watch and share.$\r$\n$\r$\nWe'll take care of the setup. You bring the soundtrack."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW StudioWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
  Function StudioWelcomeShow
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Let's begin"
  FunctionEnd
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "You're all set"
  !define MUI_FINISHPAGE_TEXT "A little space for your sound.$\r$\n$\r$\nVisualiser Studio is ready. Open a track, explore a style, and make something that feels like you."
  !define MUI_FINISHPAGE_BUTTON "Done"
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Open Visualiser Studio"
  !define MUI_FINISHPAGE_RUN_FUNCTION StudioStartApp
  !insertmacro MUI_PAGE_FINISH
  Function StudioStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
!macroend
