; Included by electron-builder's NSIS templates (DESKTOP-SPEC §9).

; Markdown files (§13): seemore is offered in Open With and listed in Settings > Default apps,
; but never made the default here. Not `fileAssociations`: electron-builder's version also
; sets each extension's own default to its class, which takes .md from any user who never
; chose an app, and an uninstall leaves .md pointing at the deleted class.
!macro seemoreAssociate EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "seemore.Markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\seemore\Capabilities\FileAssociations" ".${EXT}" "seemore.Markdown"
!macroend

!macro seemoreUnassociate EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "seemore.Markdown"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\seemore.Markdown" "" "Markdown document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\seemore.Markdown\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\seemore.Markdown\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\seemore\Capabilities" "ApplicationName" "seemore"
  WriteRegStr SHELL_CONTEXT "Software\seemore\Capabilities" "ApplicationDescription" "Open a folder of Markdown as a site."
  !insertmacro seemoreAssociate md
  !insertmacro seemoreAssociate markdown
  !insertmacro seemoreAssociate mdx
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "seemore" "Software\seemore\Capabilities"
  ; SHCNE_ASSOCCHANGED, so Explorer picks the entries up without a sign-out.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

; The app unpacks its CLI into %LOCALAPPDATA%\seemore\cli on first launch. An uninstall
; removes it; an update leaves it, and the new version deletes the old copy itself once it has
; unpacked its own. `rd` with a \\?\ path, because NSIS's RMDir can't reach the CLI's paths
; past MAX_PATH. The Markdown entries also stay through an update, which writes them again.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro seemoreUnassociate md
    !insertmacro seemoreUnassociate markdown
    !insertmacro seemoreUnassociate mdx
    DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "seemore"
    DeleteRegKey SHELL_CONTEXT "Software\seemore\Capabilities"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\seemore"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\seemore.Markdown"
  ${endIf}
  ${ifNot} ${isUpdated}
  ${andIf} $LOCALAPPDATA != ""
    nsExec::Exec `"$SYSDIR\cmd.exe" /C rd /s /q "\\?\$LOCALAPPDATA\seemore\cli"`
    Pop $0
    ; Only if empty.
    RMDir "$LOCALAPPDATA\seemore"
  ${endIf}
!macroend
