; Included by electron-builder's NSIS templates (DESKTOP-SPEC §9).

; The app unpacks its CLI into %LOCALAPPDATA%\seemore\cli on first launch. An uninstall
; removes it; an update leaves it, and the new version deletes the old copy itself once it has
; unpacked its own. `rd` with a \\?\ path, because NSIS's RMDir can't reach the CLI's paths
; past MAX_PATH.
!macro customUnInstall
  ${ifNot} ${isUpdated}
  ${andIf} $LOCALAPPDATA != ""
    nsExec::Exec `"$SYSDIR\cmd.exe" /C rd /s /q "\\?\$LOCALAPPDATA\seemore\cli"`
    Pop $0
    ; Only if empty.
    RMDir "$LOCALAPPDATA\seemore"
  ${endIf}
!macroend
