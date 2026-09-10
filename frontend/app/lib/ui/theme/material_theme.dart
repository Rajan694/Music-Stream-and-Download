import 'package:flutter/material.dart';
import 'tokens.dart';

final ThemeData materialTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: primaryColor,
    brightness: Brightness.dark,
  ).copyWith(
    primary: primaryColor,
    secondary: secondaryColor,
    surface: surfaceDark1,
    onSurface: onSurfaceDark,
    error: errorColor,
  ),
  scaffoldBackgroundColor: surfaceDark0,
  appBarTheme: const AppBarTheme(
    backgroundColor: surfaceDark1,
    elevation: 0,
    scrolledUnderElevation: 0,
  ),
  cardTheme: const CardTheme(
    color: surfaceDark1,
    elevation: 0,
    margin: EdgeInsets.zero,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: surfaceDark2,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(radiusMd),
      borderSide: const BorderSide(color: borderDark),
    ),
    contentPadding: const EdgeInsets.symmetric(
      horizontal: spacingLg,
      vertical: spacingMd,
    ),
  ),
  textTheme: const TextTheme(
    displayLarge: TextStyle(
      fontSize: 40,
      height: 44 / 40,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      fontFamily: 'Inter',
    ),
    headlineMedium: TextStyle(
      fontSize: 28,
      height: 34 / 28,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.3,
      fontFamily: 'Inter',
    ),
    titleLarge: TextStyle(
      fontSize: 20,
      height: 26 / 20,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
      fontFamily: 'Inter',
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      height: 22 / 16,
      fontWeight: FontWeight.w600,
      letterSpacing: 0,
      fontFamily: 'Inter',
    ),
    bodyMedium: TextStyle(
      fontSize: 14,
      height: 20 / 14,
      fontWeight: FontWeight.w400,
      letterSpacing: 0,
      fontFamily: 'Inter',
    ),
    bodySmall: TextStyle(
      fontSize: 13,
      height: 18 / 13,
      fontWeight: FontWeight.w400,
      letterSpacing: 0,
      fontFamily: 'Inter',
    ),
    labelMedium: TextStyle(
      fontSize: 12,
      height: 16 / 12,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.2,
      fontFamily: 'Inter',
    ),
    labelSmall: TextStyle(
      fontSize: 11,
      height: 14 / 11,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.4,
      fontFamily: 'Inter',
      fontFeatures: [FontFeature.tabularFigures()],
    ),
  ),
);
