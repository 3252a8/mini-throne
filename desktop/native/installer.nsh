!macro customInstall
  ; A personalized ZIP contains the unchanged installer and an expiring ticket.
  ; Never replace an already authorized account during repair or upgrade.
  IfFileExists "$APPDATA\Mini Throne\account.bin" mini_throne_enroll_done
  IfFileExists "$EXEDIR\mini-throne.enroll" 0 mini_throne_enroll_done
  CreateDirectory "$APPDATA\Mini Throne"
  CopyFiles /SILENT "$EXEDIR\mini-throne.enroll" "$APPDATA\Mini Throne\pending-enrollment.json"
  mini_throne_enroll_done:
!macroend
