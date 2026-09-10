import 'package:flutter/material.dart';
import 'bootstrap.dart';
import 'app.dart';

void main() async {
  await bootstrap();
  runApp(const MusicStreamApp());
}
