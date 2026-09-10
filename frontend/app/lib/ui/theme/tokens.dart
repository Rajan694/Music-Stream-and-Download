// dart:ui, not material — tokens must stay design-system agnostic so the
// Fluent theme builder does not transitively depend on Material. `Color` is
// all this file needs.
import 'dart:ui' show Color;

const Color primaryColor = Color(0xFF8B5CF6);
const Color primaryDarkColor = Color(0xFF6D28D9);
const Color secondaryColor = Color(0xFF06B6D4);
const Color secondaryDarkColor = Color(0xFF0891B2);

const Color surfaceDark0 = Color(0xFF070709);
const Color surfaceDark1 = Color(0xFF0F0F14);
const Color surfaceDark2 = Color(0xFF181820);
const Color surfaceDark3 = Color(0xFF22222C);
const Color onSurfaceDark = Color(0xFFFAFAFA);
const Color onSurfaceMutedDark = Color(0xFFA1A1AA);
const Color borderDark = Color.fromARGB(20, 255, 255, 255);

const Color surfaceLight0 = Color(0xFFFAFAFA);
const Color surfaceLight1 = Color(0xFFFFFFFF);
const Color surfaceLight2 = Color(0xFFF4F4F5);
const Color surfaceLight3 = Color(0xFFE4E4E7);
const Color onSurfaceLight = Color(0xFF18181B);
const Color onSurfaceMutedLight = Color(0xFF52525B);
const Color borderLight = Color.fromARGB(20, 0, 0, 0);

const Color errorColor = Color(0xFFF87171);
const Color successColor = Color(0xFF34D399);

const double radiusSm = 8.0;
const double radiusMd = 12.0;
const double radiusLg = 16.0;
const double radiusXl = 24.0;

const double spacingXs = 4.0;
const double spacingSm = 8.0;
const double spacingMd = 12.0;
const double spacingLg = 16.0;
const double spacingXl = 24.0;
const double spacingXxl = 32.0;
const double spacingXxxl = 48.0;
