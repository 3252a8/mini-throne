!macro customInstall
  ; Every user downloads the same EXE bytes with a personalized filename.
  ; Never replace an already authorized account during repair or upgrade.
  IfFileExists "$APPDATA\Mini Throne\account.bin" mini_throne_enroll_done
  Push $0
  Push $1
  StrCpy $1 $EXEFILE 23
  StrCmp $1 "Mini-Throne-Setup--mt1." 0 mini_throne_enroll_restore
  CreateDirectory "$APPDATA\Mini Throne"
  FileOpen $0 "$APPDATA\Mini Throne\pending-installer.txt" w
  IfErrors mini_throne_enroll_restore
  FileWriteUTF16LE $0 $EXEFILE
  FileClose $0
  mini_throne_enroll_restore:
  Pop $1
  Pop $0
  mini_throne_enroll_done:
  ; Shell links can be unavailable while Windows refreshes them after an update.
  ; Launch the installed executable directly; preserve the standard user token.
  StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend
