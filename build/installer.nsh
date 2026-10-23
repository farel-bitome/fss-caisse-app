; Installation automatique des pilotes d'imprimantes inclus dans l'application
; (dossier "drivers"). Exécuté à la fin de l'installation de FSS-CAISSE.
!macro customInstall
  IfFileExists "$INSTDIR\resources\drivers\installer-pilotes.ps1" 0 +3
    DetailPrint "Installation des pilotes d'imprimantes..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\drivers\installer-pilotes.ps1" -Interactif'
!macroend
