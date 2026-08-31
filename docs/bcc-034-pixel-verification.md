# BCC-034: GitHub-artifact naar fysieke Pixel

Dit protocol houdt twee bewijzen apart:

- GitHub Actions bewijst build, test, lint en `assemble` voor de artifact-commit.
- De fysieke Pixel bewijst installatie, Health Connect en het gedrag met echte device-data.

Voer geen lokale `assembleDebug` uit voor deze handoff.

## Bekende CI-provenance

| Veld | Waarde |
| --- | --- |
| Run | `33431946407` |
| Artifact | `mission-control-android-debug-0c412ec6cee6f87dbb9641f6fa9896ef9e32c882` |
| Artifact-ID | `9772994138` |
| Commit | `0c412ec6cee6f87dbb9641f6fa9896ef9e32c882` |
| APK in artifact | `app-debug.apk` |

Controleer de run en artifact-relatie vóór installatie:

```sh
gh run view 33431946407 --repo emile-bodin/mission-control \
  --json databaseId,headSha,status,conclusion
gh api repos/emile-bodin/mission-control/actions/runs/33431946407/artifacts \
  --jq '.artifacts[] | select(.id == 9772994138) | {id,name,expired,workflow_run}'
```

Beide `headSha`-waarden moeten de hierboven genoemde commit zijn; de run moet
`completed` en `success` zijn en het artifact mag niet verlopen zijn.

## Download en APK-controle

Download uitsluitend artifact `9772994138`, buiten de worktree:

```sh
handoff_dir=$(mktemp -d /tmp/mission-control-hyd185-XXXXXX)
archive="$handoff_dir/artifact-9772994138.zip"
gh api repos/emile-bodin/mission-control/actions/artifacts/9772994138/zip > "$archive"
unzip -Z -1 "$archive"
unzip -q "$archive" -d "$handoff_dir/extracted"
apk="$handoff_dir/extracted/app-debug.apk"
test -f "$apk"
sha256sum "$archive" "$apk"
```

`unzip -Z -1` moet alleen `app-debug.apk` tonen. Gebruik nooit een lokaal door
Gradle gebouwde APK als vervanging.

## Wireless ADB en installatie

Gebruik eerst bestaande verbinding:

```sh
adb devices -l
```

Alleen als geen regel met status `device` bestaat, open op de Pixel **Wireless
debugging** en gebruik de daar getoonde adressen. Pairing-adres en
debugging-adres zijn verschillend. Bewaar of log pairing-code niet.

```sh
adb pair <Pixel-pairing-adres:poort>
adb connect <Pixel-wireless-debugging-adres:poort>
adb devices -l
```

Reset of revoke een bestaande pairing niet. Installeer daarna precies de
gedownloade artifact-APK:

```sh
adb install -r "$apk"
```

Noteer model en Android/API-versie zonder device-serienummer of health-data:

```sh
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
```

## Fysieke HYD-176 verificatie

Start app op de Pixel. Verifieer in deze volgorde en noteer alleen uitkomst,
geen health-recordinhoud of device-token.

1. Health Connect is beschikbaar.
2. Weiger permissies eerst. Sync moet geen records lezen of versturen.
3. Verleen daarna beide bestaande read-permissions: `READ_WEIGHT` en
   `READ_EXERCISE`.
4. Als Health Connect testdata bevat: verifieer een echte weight-read en een
   echte activity/exercise-read. Zonder passende testdata is elk resultaat
   `Unknown`, niet `0` of `success`.
5. Voer sync naar bestaande backend uit. Herhaal dezelfde sync en verifieer
   feitelijk dat geen dubbele records zijn gemaakt.

Een revoked-token/401-test verandert pairing-state. Doe die alleen met
expliciete toestemming en een veilig re-pair-plan; hij is geen standaardstap
in deze handoff.

`connectedAndroidTest` is optioneel. Het kan lokale Gradle-compilatie starten
en bewijst geen GitHub-artifact-installatie. Voer het alleen bij een verbonden
device en beschikbare JDK/Android SDK uit, met minimale workers:

```sh
./gradlew :app:connectedAndroidTest --no-daemon --max-workers=1
```

Rapporteer die uitvoering afzonderlijk van de fysieke artifact-test.
