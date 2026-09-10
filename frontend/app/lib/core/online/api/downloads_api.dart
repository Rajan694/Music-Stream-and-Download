import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dio_client.dart';

final downloadsApiProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return DownloadsApi(dio);
});

class DownloadsApi {
  final Dio _dio;

  DownloadsApi(this._dio);

  Future<EstimateResponse> estimateDownload(String videoId, {String format = 'mp3', String quality = 'high'}) async {
    final response = await _dio.post(
      '/downloads/estimate',
      data: {
        'videoId': videoId,
        'format': format,
        'quality': quality,
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to estimate download');
    }

    return EstimateResponse.fromJson(response.data);
  }

  Future<DownloadJobResponse> createDownload(String videoId, {String format = 'mp3', String quality = 'high'}) async {
    final response = await _dio.post(
      '/downloads',
      data: {
        'videoId': videoId,
        'format': format,
        'quality': quality,
      },
    );

    if (response.statusCode != 201) {
      throw Exception('Failed to create download: ${response.data['message']}');
    }

    return DownloadJobResponse.fromJson(response.data);
  }

  Future<DownloadJobResponse> getDownloadStatus(String jobId) async {
    final response = await _dio.get('/downloads/$jobId');

    if (response.statusCode != 200) {
      throw Exception('Failed to get download status');
    }

    return DownloadJobResponse.fromJson(response.data);
  }

  Future<List<DownloadJobResponse>> listDownloads({int limit = 50}) async {
    final response = await _dio.get(
      '/downloads',
      queryParameters: {'limit': limit},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to list downloads');
    }

    final list = response.data as List;
    return list.map((j) => DownloadJobResponse.fromJson(j)).toList();
  }

  Future<void> cancelDownload(String jobId) async {
    final response = await _dio.post('/downloads/$jobId/cancel');

    if (response.statusCode != 200) {
      throw Exception('Failed to cancel download');
    }
  }
}

class EstimateResponse {
  final int estimatedSizeBytes;
  final String format;
  final String quality;
  final int estimatedDurationSeconds;

  EstimateResponse({
    required this.estimatedSizeBytes,
    required this.format,
    required this.quality,
    required this.estimatedDurationSeconds,
  });

  factory EstimateResponse.fromJson(Map<String, dynamic> json) {
    return EstimateResponse(
      estimatedSizeBytes: json['estimatedSizeBytes'],
      format: json['format'],
      quality: json['quality'],
      estimatedDurationSeconds: json['estimatedDurationSeconds'],
    );
  }
}

class DownloadJobResponse {
  final String id;
  final String videoId;
  final String title;
  final String state; // queued, resolving, downloading, transcoding, completed, failed
  final int progress; // 0-100
  final String? errorCode;
  final int? fileSize;
  final DateTime createdAt;
  final DateTime? completedAt;

  DownloadJobResponse({
    required this.id,
    required this.videoId,
    required this.title,
    required this.state,
    required this.progress,
    this.errorCode,
    this.fileSize,
    required this.createdAt,
    this.completedAt,
  });

  factory DownloadJobResponse.fromJson(Map<String, dynamic> json) {
    return DownloadJobResponse(
      id: json['id'],
      videoId: json['videoId'],
      title: json['title'],
      state: json['state'],
      progress: json['progress'] ?? 0,
      errorCode: json['errorCode'],
      fileSize: json['fileSize'],
      createdAt: DateTime.parse(json['createdAt']),
      completedAt: json['completedAt'] != null ? DateTime.parse(json['completedAt']) : null,
    );
  }
}
