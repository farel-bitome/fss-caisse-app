# FSS-CAISSE - installation automatique des pilotes d'imprimantes.
# 1) Tous les fichiers .inf places dans drivers\inf (ou ses sous-dossiers) sont ajoutes a Windows
#    avec pnputil : l'imprimante USB correspondante est reconnue des qu'elle est branchee.
# 2) Tous les installateurs .exe places dans drivers\auto sont lances en mode silencieux
#    (/VERYSILENT /SUPPRESSMSGBOXES /NORESTART - convient aux installateurs de type Inno Setup).
param([switch]$Interactif)
$ErrorActionPreference = 'Continue'
$racine = Split-Path -Parent $MyInvocation.MyCommand.Path
$journal = Join-Path $env:ProgramData 'FSS-CAISSE-pilotes.log'
function Log($m) { Add-Content -Path $journal -Value ((Get-Date -Format 's') + ' ' + $m) }
Log '--- installation des pilotes ---'
$dossierInf = Join-Path $racine 'inf'
if (Test-Path $dossierInf) {
  Get-ChildItem -Path $dossierInf -Filter *.inf -Recurse | ForEach-Object {
    Log ('INF : ' + $_.FullName)
    $r = & pnputil.exe /add-driver $_.FullName /install 2>&1
    Log ($r -join ' ')
  }
}
# 2) Pilote universel (en premier : rapide, ne depend d'aucun assistant) : pilote generique de Windows « Generic / Text Only » + une imprimante par port USB libre.
#    FSS-CAISSE envoie alors le ticket en ESC/POS direct (mode « ESC/POS direct ») : fonctionne avec
#    toute imprimante thermique ESC/POS USB (Xprinter, Epson, Rongta, Star en mode ESC/POS, Bixolon,
#    Citizen, HPRT...), meme sans pilote du fabricant.
try {
  if (-not (Get-PrinterDriver -Name 'Generic / Text Only' -ErrorAction SilentlyContinue)) {
    Add-PrinterDriver -Name 'Generic / Text Only' -ErrorAction Stop
    Log 'pilote generique ajoute'
  }
  $utilises = @(Get-Printer -ErrorAction SilentlyContinue | ForEach-Object { $_.PortName })
  Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'USB*' } | ForEach-Object {
    if ($utilises -notcontains $_.Name) {
      $nom = 'Imprimante universelle ESC/POS (' + $_.Name + ')'
      try { Add-Printer -Name $nom -DriverName 'Generic / Text Only' -PortName $_.Name -ErrorAction Stop; Log ('creee : ' + $nom) }
      catch { Log ('echec ' + $nom + ' : ' + $_.Exception.Message) }
    }
  }
} catch { Log ('pilote universel : ' + $_.Exception.Message) }
# 3) Installateurs des fabricants (Xprinter, Epson...)
$dossierAuto = Join-Path $racine 'auto'
if (Test-Path $dossierAuto) {
  # commandes.json : arguments d'installation silencieuse par fichier. null = silencieux non verifie :
  # le fichier n'est lance qu'avec -Interactif (bouton "Installer les pilotes" des Parametres).
  $cmd = @{}
  $fc = Join-Path $dossierAuto 'commandes.json'
  if (Test-Path $fc) { try { (Get-Content $fc -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cmd[$_.Name] = $_.Value } } catch { Log 'commandes.json illisible' } }
  Get-ChildItem -Path $dossierAuto -Filter *.exe | ForEach-Object {
    $args2 = $null; $connu = $cmd.ContainsKey($_.Name)
    if ($connu) { $args2 = $cmd[$_.Name] } else { $args2 = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') }
    if ($null -eq $args2 -and -not $Interactif) { Log ('ignore (installation manuelle requise) : ' + $_.Name); return }
    Log ('EXE : ' + $_.FullName)
    try {
      if ($null -eq $args2) { $p = Start-Process -FilePath $_.FullName -PassThru }
      else { $p = Start-Process -FilePath $_.FullName -ArgumentList $args2 -PassThru }
      $delai = if ($null -eq $args2) { 900000 } else { 180000 }
      if (-not $p.WaitForExit($delai)) { Log 'delai depasse'; try { $p.Kill() } catch {} }
      else { Log ('code ' + $p.ExitCode) }
    } catch { Log ('erreur : ' + $_.Exception.Message) }
  }
}
Log '--- fin ---'
