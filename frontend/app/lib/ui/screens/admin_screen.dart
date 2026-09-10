import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/online/api/admin_api.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final overviewAsync = ref.watch(adminOverviewProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Listeners'),
            Tab(text: 'Tracks'),
            Tab(text: 'Artists'),
          ],
        ),
      ),
      body: overviewAsync.when(
        data: (overview) => TabBarView(
          controller: _tabController,
          children: [
            _OverviewTab(overview: overview),
            const _ListenersTab(),
            const _TracksTab(),
            const _ArtistsTab(),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

final adminOverviewProvider = FutureProvider<AdminOverview>((ref) async {
  final api = ref.read(adminApiProvider);
  return api.getOverview();
});

class _OverviewTab extends StatelessWidget {
  final AdminOverview overview;

  const _OverviewTab({required this.overview});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Last 30 Days',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _StatCard(title: 'Total Users', value: overview.totalUsers.toString())),
              const SizedBox(width: 16),
              Expanded(child: _StatCard(title: 'DAU', value: overview.dau.toString())),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _StatCard(title: 'Plays', value: overview.plays.toString())),
              const SizedBox(width: 16),
              Expanded(child: _StatCard(title: 'Downloads', value: overview.downloads.toString())),
            ],
          ),
          const SizedBox(height: 16),
          _StatCard(title: 'Signups', value: overview.signups.toString()),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;

  const _StatCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(value, style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
      ),
    );
  }
}

class _ListenersTab extends ConsumerWidget {
  const _ListenersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listenersAsync = ref.watch(topListenersProvider);

    return listenersAsync.when(
      data: (listeners) => ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: listeners.length,
        itemBuilder: (context, index) {
          final listener = listeners[index];
          return ListTile(
            leading: CircleAvatar(child: Text('${index + 1}')),
            title: Text(listener.email),
            trailing: Text('${listener.plays} plays'),
          );
        },
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }
}

final topListenersProvider = FutureProvider<List<TopListener>>((ref) async {
  final api = ref.read(adminApiProvider);
  return api.getTopListeners();
});

class _TracksTab extends ConsumerWidget {
  const _TracksTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracksAsync = ref.watch(topTracksProvider);

    return tracksAsync.when(
      data: (tracks) => ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: tracks.length,
        itemBuilder: (context, index) {
          final track = tracks[index];
          return ListTile(
            leading: CircleAvatar(child: Text('${index + 1}')),
            title: Text(track.title),
            subtitle: Text(track.uploaderName),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${track.plays} plays'),
                Text('${track.uniqueListeners} listeners', style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          );
        },
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }
}

final topTracksProvider = FutureProvider<List<TopTrack>>((ref) async {
  final api = ref.read(adminApiProvider);
  return api.getTopTracks();
});

class _ArtistsTab extends ConsumerWidget {
  const _ArtistsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final artistsAsync = ref.watch(topArtistsProvider);

    return artistsAsync.when(
      data: (artists) => ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: artists.length,
        itemBuilder: (context, index) {
          final artist = artists[index];
          return ListTile(
            leading: CircleAvatar(child: Text('${index + 1}')),
            title: Text(artist.uploaderName),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${artist.plays} plays'),
                Text('${artist.uniqueListeners} listeners', style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          );
        },
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }
}

final topArtistsProvider = FutureProvider<List<TopArtist>>((ref) async {
  final api = ref.read(adminApiProvider);
  return api.getTopArtists();
});