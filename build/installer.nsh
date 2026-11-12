; ============================================================================
; FSS-CAISSE — installateur / mise à jour sans blocage
; ============================================================================

; 1) AU DÉMARRAGE DE L'INSTALLATEUR : on ferme FSS-CAISSE de force (s'il tourne) et on
;    NEUTRALISE le lancement de l'ANCIEN désinstallateur. C'était lui qui affichait
;    « FSS-CAISSE ne peut pas être fermé » en boucle : il contient l'ancienne vérification
;    de l'application, impossible à corriger de l'extérieur.
;    Les nouveaux fichiers sont simplement installés PAR-DESSUS l'ancienne version.
;    Les données (base, licence, réglages) sont dans %APPDATA%\fss-caisse : jamais touchées.
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1500
  SetRegView 64
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
  !endif
  SetRegView 32
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
  !endif
  SetRegView 64
!macroend

; 2) Remplace la vérification « application en cours d'exécution » : fermeture forcée, jamais de blocage.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1500
!macroend

; 3) Fin d'installation : supprime les anciens fichiers en vrac (anciennes versions sans archive
;    app.asar) pour que la nouvelle version soit bien celle qui démarre, puis installe les pilotes.
!macro customInstall
  RMDir /r "$INSTDIR\resources\app"
  IfFileExists "$INSTDIR\resources\drivers\installer-pilotes.ps1" 0 +3
    DetailPrint "Installation des pilotes d'imprimantes..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\drivers\installer-pilotes.ps1" -Interactif'
!macroend
