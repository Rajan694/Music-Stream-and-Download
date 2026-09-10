import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/online/api/media_api.dart';
import '../widgets/shimmer.dart';

final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider.autoDispose<List<VideoInfo>>((ref) async {
  final query = ref.watch(searchQueryProvider);
  if (query.isEmpty) return [];
  
  final api = ref.read(mediaApiProvider);
  final response = await api.search(query);
  return response.results;
});

class SearchScreen extends ConsumerStatefulWidget {
  final String initialQuery;

  const SearchScreen({super.key, this.initialQuery = ''});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _controller;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
    if (widget.initialQuery.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(searchQueryProvider.notifier).state = widget.initialQuery;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).state = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final resultsAsync = ref.watch(searchResultsProvider);
    final query = ref.watch(searchQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          decoration: const InputDecoration(
            hintText: 'Search for songs, artists...',
            border: InputBorder.none,
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: _onSearchChanged,
          autofocus: true,
        ),
      ),
      body: query.isEmpty
          ? const Center(child: Text('Search for music'))
          : resultsAsync.when(
              data: (results) {
                if (results.isEmpty) {
                  return const Center(child: Text('No results found'));
                }
                return ListView.builder(
                  itemCount: results.length,
                  itemBuilder: (context, index) {
                    final video = results[index];
                    return ListTile(
                      leading: video.thumbnailUrl != null
                          ? Image.network(
                              video.thumbnailUrl!,
                              width: 56,
                              height: 56,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(Icons.music_note),
                            )
                          : const Icon(Icons.music_note),
                      title: Text(video.title),
                      subtitle: Text(video.uploaderName),
                      onTap: () => context.go('/video/${video.videoId}'),
                    );
                  },
                );
              },
              loading: () => ListView.builder(
                itemCount: 8,
                itemBuilder: (_, __) => const ShimmerListItem(),
              ),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
    );
  }
}