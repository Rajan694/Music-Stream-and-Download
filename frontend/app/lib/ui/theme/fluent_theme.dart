import 'package:fluent_ui/fluent_ui.dart';
import 'tokens.dart';

final FluentThemeData fluentTheme = FluentThemeData(
  brightness: Brightness.dark,
  accentColor: AccentColor.swatch({
    'darkest': const Color(0xFF6D28D9),
    'darker': const Color(0xFF7C3AED),
    'dark': const Color(0xFF8B5CF6),
    'normal': const Color(0xFF8B5CF6),
    'light': const Color(0xFFA78BFA),
    'lighter': const Color(0xFFC4B5FD),
    'lightest': const Color(0xFFEDE9FE),
  }),
  cardColor: surfaceDark1,
  navigationPaneTheme: const NavigationPaneThemeData(
    backgroundColor: surfaceDark0,
  ),
  resources: {
    'TextBoxBackground': surfaceDark2,
    'TextBoxBorderBrush': borderDark,
    'ControlFillColorDefault': surfaceDark2,
    'ControlFillColorSecondary': surfaceDark3,
  },
);
