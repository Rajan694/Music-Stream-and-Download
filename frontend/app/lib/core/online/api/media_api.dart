import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dio_client.dart';

final mediaApiProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return MediaApi(dio);
});

/// Mirrors `packages/shared/src/media.ts`. Field names follow the zod schemas
/// exactly — the wire format uses `id`, not `videoId`, and ships a
/// `thumbnails[]` array rather than a single URL.
class MediaApi {
  final Dio _dio;

  MediaApi(this._dio);

  /// `/media/search` returns a discriminated union on `intent`: a bare
  /// video/playlist id when the query parsed as a URL, otherwise a result list.
  Future<SearchOutcome> search(String query, {CancelToken? cancelToken}) async {
    final response = await _dio.get(
      '/media/search',
      queryParameters: {'q': query},
      cancelToken: cancelToken,
    );

    final data = response.data as Map<String, dynamic>;
    switch (data['intent'] as String?) {
      case 'video':
        return SearchOutcome.video(data['id'] as String);
      case 'playlist':
        return SearchOutcome.playlist(data['id'] as String);
      default:
        final result = data['data'] as Map<String, dynamic>;
        final items = (result['items'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            // Playlist rows carry no duration and cannot be queued; the caller
            // that wants them should read `items` directly.
            .where((i) => i['type'] == 'video')
            .map(VideoInfo.fromJson)
            .toList();
        return SearchOutcome.results(items, result['suggestion'] as String?);
    }
  }

  Future<List<String>> suggestions(String query, {CancelToken? cancelToken}) async {
    final response = await _dio.get(
      '/media/suggestions',
      queryParameters: {'q': query},
      cancelToken: cancelToken,
    );
    return (response.data as List? ?? const []).cast<String>();
  }

  Future<VideoInfo> getVideoInfo(String videoId, {CancelToken? cancelToken}) async {
    final response = await _dio.get('/media/videos/$videoId', cancelToken: cancelToken);
    return VideoInfo.fromJson(response.data as Map<String, dynamic>);
  }

  /// Backs auto-radio. Purpose-built for this and not rate-limited as tightly
  /// as `/media/search` (60/min).
  Future<List<VideoInfo>> getRelated(String videoId, {CancelToken? cancelToken}) async {
    final response = await _dio.get(
      '/media/videos/$videoId/suggestions',
      cancelToken: cancelToken,
    );
    return (response.data as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(VideoInfo.fromJson)
        .toList();
  }

  Future<String> getStreamTicket(String videoId, {CancelToken? cancelToken}) async {
    final response = await _dio.post(
      '/media/videos/$videoId/ticket',
      cancelToken: cancelToken,
    );
    return (response.data as Map<String, dynamic>)['ticket'] as String;
  }
}

sealed class SearchOutcome {
  const SearchOutcome();

  factory SearchOutcome.video(String id) = SearchVideoIntent;
  factory SearchOutcome.playlist(String id) = SearchPlaylistIntent;
  factory SearchOutcome.results(List<VideoInfo> items, String? suggestion) =
      SearchResults;
}

final class SearchVideoIntent extends SearchOutcome {
  final String id;
  const SearchVideoIntent(this.id);
}

final class SearchPlaylistIntent extends SearchOutcome {
  final String id;
  const SearchPlaylistIntent(this.id);
}

final class SearchResults extends SearchOutcome {
  final List<VideoInfo> items;
  final String? suggestion;
  const SearchResults(this.items, this.suggestion);
}

class Thumbnail {
  final String url;
  final int? width;
  final int? height;

  const Thumbnail({required this.url, this.width, this.height});

  factory Thumbnail.fromJson(Map<String, dynamic> json) => Thumbnail(
        url: json['url'] as String,
        width: json['width'] as int?,
        height: json['height'] as int?,
      );
}

class VideoInfo {
  final String id;
  final String title;
  final String uploaderName;
  final String? uploaderId;

  /// seconds
  final int duration;
  final List<Thumbnail> thumbnails;
  final int? viewCount;

  /// Optional on the wire and not always a parseable date — kept as the raw
  /// string rather than a DateTime so one odd value can't fail the whole list.
  final String? uploadDate;

  const VideoInfo({
    required this.id,
    required this.title,
    required this.uploaderName,
    this.uploaderId,
    required this.duration,
    this.thumbnails = const [],
    this.viewCount,
    this.uploadDate,
  });

  /// Call sites read `.videoId`; the wire field is `id`.
  String get videoId => id;

  /// Widest thumbnail, falling back to the first. Null when none were sent.
  String? get thumbnailUrl {
    if (thumbnails.isEmpty) return null;
    final sized = thumbnails.where((t) => t.width != null).toList()
      ..sort((a, b) => b.width!.compareTo(a.width!));
    return (sized.isNotEmpty ? sized.first : thumbnails.first).url;
  }

  factory VideoInfo.fromJson(Map<String, dynamic> json) => VideoInfo(
        id: json['id'] as String,
        title: json['title'] as String,
        uploaderName: json['uploaderName'] as String? ?? '',
        uploaderId: json['uploaderId'] as String?,
        duration: (json['duration'] as num?)?.toInt() ?? 0,
        thumbnails: (json['thumbnails'] as List? ?? const [])
            .cast<Map<String, dynamic>>()
            .map(Thumbnail.fromJson)
            .toList(),
        viewCount: (json['viewCount'] as num?)?.toInt(),
        uploadDate: json['uploadDate'] as String?,
      );
}
