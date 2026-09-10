import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fluent_ui/fluent_ui.dart' as fluent;
import '../widgets/app_scaffold.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _selectedIndex = 0;

  final _navigationItems = [
    NavigationItem(
      label: 'Home',
      icon: Icons.home,
      pageBuilder: () => const _HomePage(),
    ),
    NavigationItem(
      label: 'Search',
      icon: Icons.search,
      pageBuilder: () => const _SearchPage(),
    ),
    NavigationItem(
      label: 'Library',
      icon: Icons.library_music,
      pageBuilder: () => const _LibraryPage(),
    ),
    NavigationItem(
      label: 'Profile',
      icon: Icons.person,
      pageBuilder: () => const _ProfilePage(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final scaffold = ref.watch(appScaffoldProvider);
    
    return scaffold.build(
      body: _navigationItems[_selectedIndex].pageBuilder(),
      navigationItems: _navigationItems,
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) => setState(() => _selectedIndex = index),
      isExtended: MediaQuery.of(context).size.width >= 600,
    );
  }
}

class _HomePage extends StatelessWidget {
  const _HomePage();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.music_note, size: 64),
          SizedBox(height: 16),
          Text(
            'Music Stream & Download',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Text('Flutter rewrite - M0 de-risking complete'),
        ],
      ),
    );
  }
}

class _SearchPage extends StatelessWidget {
  const _SearchPage();

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Search Page (M1)'));
  }
}

class _LibraryPage extends StatelessWidget {
  const _LibraryPage();

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Library Page (M2)'));
  }
}

class _ProfilePage extends StatelessWidget {
  const _ProfilePage();

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Profile Page (M1)'));
  }
}