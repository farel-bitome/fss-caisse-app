# FSS-CAISSE - installation des pilotes de l'afficheur client (puces USB-serie : FTDI, CH340, CP210x, Prolific...).
# 1) Tous les .inf de drivers\afficheur\inf (et sous-dossiers) sont ajoutes a Windows avec pnputil.
# 2) Tous les .exe de drivers\afficheur\auto sont lances en mode silencieux.
# 3) Windows relance la detection des peripheriques.
param([switch]$Interactif)
$ErrorActionPreference = 'Continue'
$racine = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'afficheur'
$journal = Join-Path $env:ProgramData 'FSS-CAISSE-pilotes-afficheur.log'
function Log($m) { Add-Content -Path $journal -Value ((Get-Date -Format 's') + ' ' + $m) }
Log '--- installation des pilotes afficheur ---'
$n = 0
$dInf = Join-Path $racine 'inf'
if (Test-Path $dInf) {
  Get-ChildItem -Path $dInf -Filter *.inf -Recurse | ForEach-Object {
    $n++; Log ('INF : ' + $_.FullName)
    $r = & pnputil.exe /add-driver $_.FullName /install 2>&1
    Log ($r -join ' ')
  }
}
$dAuto = Join-Path $racine 'auto'
if (Test-Path $dAuto) {
  Get-ChildItem -Path $dAuto -Filter *.exe | ForEach-Object {
    $n++; Log ('EXE : ' + $_.FullName)
    try { Start-Process -FilePath $_.FullName -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/S','/quiet' -Wait -ErrorAction Stop; Log 'ok' }
    catch { Log ('echec : ' + $_.Exception.Message) }
  }
}
& pnputil.exe /scan-devices 2>&1 | Out-Null
Log ('termine, ' + $n + ' element(s)')
if ($n -eq 0) { Log 'Aucun pilote dans drivers\afficheur : Windows Update installera le pilote si le PC est connecte a Internet.' }
