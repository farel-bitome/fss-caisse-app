; Installation automatique des pilotes d'imprimantes inclus dans l'application
; (dossier "drivers"). Exécuté à la fin de l'installation de FSS-CAISSE.
!macro customInstall
  IfFileExists "$INSTDIR\resources\drivers\installer-pilotes.ps1" 0 +3
    DetailPrint "Installation des pilotes d'imprimantes..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\drivers\installer-pilotes.ps1" -Interactif'
!macroend

; Remplace la vérification « application en cours d'exécution » de l'installateur :
; on ferme de force FSS-CAISSE s'il tourne (la fenêtre de confirmation de fermeture de
; l'application bloquait l'installateur) puis on continue sans jamais bloquer.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1500
!macroend
