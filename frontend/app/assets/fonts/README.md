# Fonts

Drop the four Inter static weights here, then uncomment the `assets:` and
`fonts:` blocks in `pubspec.yaml`:

- Inter-Regular.ttf   (400)
- Inter-Medium.ttf    (500)
- Inter-SemiBold.ttf  (600)
- Inter-Bold.ttf      (700)

Get them from https://github.com/rsms/inter/releases (OFL licensed).

Prefer the four static weights over `Inter-Variable.ttf`: the variable `wght`
axis needs an explicit `FontVariation` in every `TextStyle` and buys nothing
here.

Do **not** add the `google_fonts` package instead — it fetches over the network
at runtime, which breaks the offline requirement this app exists for and
flashes a fallback face on first launch.
