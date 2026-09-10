import 'package:flutter/material.dart';
import 'package:fluent_ui/fluent_ui.dart' as fluent;
import '../../core/common/platform/platform.dart';

abstract interface class AppScaffold {
  Widget build({
    required Widget body,
    required List<NavigationItem> navigationItems,
    required int selectedIndex,
    required Function(int) onDestinationSelected,
    required bool isExtended,
  });
}

final class NavigationItem {
  final String label;
  final IconData icon;
  final Widget Function() pageBuilder;

  NavigationItem({
    required this.label,
    required this.icon,
    required this.pageBuilder,
  });
}

class MaterialScaffold implements AppScaffold {
  @override
  Widget build({
    required Widget body,
    required List<NavigationItem> navigationItems,
    required int selectedIndex,
    required Function(int) onDestinationSelected,
    required bool isExtended,
  }) {
    final destinations = navigationItems.map((item) => NavigationDestination(
      icon: Icon(item.icon),
      label: item.label,
    )).toList();

    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        destinations: destinations,
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
      ),
    );
  }
}

class FluentScaffold implements AppScaffold {
  @override
  Widget build({
    required Widget body,
    required List<NavigationItem> navigationItems,
    required int selectedIndex,
    required Function(int) onDestinationSelected,
    required bool isExtended,
  }) {
    final paneItems = navigationItems.map((item) => fluent.PaneItem(
      icon: fluent.Icon(item.icon),
      title: fluent.Text(item.label),
    )).toList();

    return fluent.Scaffold(
      key: const Key('fluent-scaffold'),
      appBar: const fluent.NavigationAppBar(
        title: fluent.Text('Music Stream'),
      ),
      body: body,
      pane: fluent.NavigationPane(
        selected: selectedIndex,
        onChanged: onDestinationSelected,
        displayMode: isExtended 
            ? fluent.PaneDisplayMode.expanded 
            : fluent.PaneDisplayMode.compact,
        items: paneItems,
      ),
    );
  }
}

// Factory provider
final appScaffoldProvider = Provider<AppScaffold>((ref) {
  final capabilities = ref.read(capabilitiesProvider);
  
  if (capabilities.usesFluent) {
    return FluentScaffold();
  }
  return MaterialScaffold();
});