import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dio_client.dart';

final adminApiProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return AdminApi(dio);
});

class AdminApi {
  final Dio _dio;

  AdminApi(this._dio);

  Future<AdminOverview> getOverview({DateTime? from, DateTime? to}) async {
    final params = <String, dynamic>{};
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await _dio.get('/admin/overview', queryParameters: params);
    return AdminOverview.fromJson(response.data);
  }

  Future<List<TopListener>> getTopListeners({int limit = 10, DateTime? from, DateTime? to}) async {
    final params = <String, dynamic>{'limit': limit};
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await _dio.get('/admin/top-listeners', queryParameters: params);
    return (response.data as List).map((e) => TopListener.fromJson(e)).toList();
  }

  Future<List<TopTrack>> getTopTracks({int limit = 10, DateTime? from, DateTime? to}) async {
    final params = <String, dynamic>{'limit': limit};
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await _dio.get('/admin/top-tracks', queryParameters: params);
    return (response.data as List).map((e) => TopTrack.fromJson(e)).toList();
  }

  Future<List<TopArtist>> getTopArtists({int limit = 10, DateTime? from, DateTime? to}) async {
    final params = <String, dynamic>{'limit': limit};
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await _dio.get('/admin/top-artists', queryParameters: params);
    return (response.data as List).map((e) => TopArtist.fromJson(e)).toList();
  }

  Future<List<TimeseriesPoint>> getTimeseries({
    String metric = 'plays',
    String bucket = 'day',
    DateTime? from,
    DateTime? to,
  }) async {
    final params = <String, dynamic>{'metric': metric, 'bucket': bucket};
    if (from != null) params['from'] = from.toIso8601String();
    if (to != null) params['to'] = to.toIso8601String();

    final response = await _dio.get('/admin/timeseries', queryParameters: params);
    return (response.data as List).map((e) => TimeseriesPoint.fromJson(e)).toList();
  }
}

class AdminOverview {
  final int totalUsers;
  final int dau;
  final int plays;
  final int downloads;
  final int signups;
  final String from;
  final String to;

  AdminOverview({
    required this.totalUsers,
    required this.dau,
    required this.plays,
    required this.downloads,
    required this.signups,
    required this.from,
    required this.to,
  });

  factory AdminOverview.fromJson(Map<String, dynamic> json) {
    return AdminOverview(
      totalUsers: json['totalUsers'] ?? 0,
      dau: json['dau'] ?? 0,
      plays: json['plays'] ?? 0,
      downloads: json['downloads'] ?? 0,
      signups: json['signups'] ?? 0,
      from: json['period']?['from'] ?? '',
      to: json['period']?['to'] ?? '',
    );
  }
}

class TopListener {
  final String userId;
  final String email;
  final int plays;

  TopListener({required this.userId, required this.email, required this.plays});

  factory TopListener.fromJson(Map<String, dynamic> json) {
    return TopListener(
      userId: json['userId'],
      email: json['email'],
      plays: json['plays'],
    );
  }
}

class TopTrack {
  final String videoId;
  final String title;
  final String uploaderName;
  final int plays;
  final int uniqueListeners;

  TopTrack({
    required this.videoId,
    required this.title,
    required this.uploaderName,
    required this.plays,
    required this.uniqueListeners,
  });

  factory TopTrack.fromJson(Map<String, dynamic> json) {
    return TopTrack(
      videoId: json['videoId'],
      title: json['title'],
      uploaderName: json['uploaderName'],
      plays: json['plays'],
      uniqueListeners: json['uniqueListeners'],
    );
  }
}

class TopArtist {
  final String uploaderName;
  final int plays;
  final int uniqueListeners;

  TopArtist({required this.uploaderName, required this.plays, required this.uniqueListeners});

  factory TopArtist.fromJson(Map<String, dynamic> json) {
    return TopArtist(
      uploaderName: json['uploaderName'],
      plays: json['plays'],
      uniqueListeners: json['uniqueListeners'],
    );
  }
}

class TimeseriesPoint {
  final String date;
  final int count;

  TimeseriesPoint({required this.date, required this.count});

  factory TimeseriesPoint.fromJson(Map<String, dynamic> json) {
    return TimeseriesPoint(
      date: json['date'],
      count: json['count'],
    );
  }
}